import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunCall;
import 'package:devpul/src/mock.dart';
import 'package:test/test.dart';

void main() {
  final events = <(String, Map<String, Object?>)>[];
  final url = Uri.parse('https://example.com/items/7?full=1');

  Future<Object?> setRules(List<Map<String, Object?>> rules) =>
      debugRunCall('http.mocks.set', {'rules': rules});

  // Without the http.mocks events setting rules posts.
  Iterable<String> kinds() =>
      events.map((e) => e.$1).where((k) => k != 'http.mocks');
  Map<String, Object?> last(String kind) =>
      events.lastWhere((e) => e.$1 == kind).$2;

  setUpAll(() => Mocks.register(Devpul.handle));

  setUp(() async {
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugListening = () => true;
    await setRules([]);
    events.clear();
    debugOnPost = (kind, event) =>
        events.add((kind, event['data']! as Map<String, Object?>));
  });

  group('rules', () {
    test('match by glob and method, first wins, off skipped', () async {
      await setRules([
        {'url': '*/items/*', 'method': 'post', 'mode': 'fail'},
        {'url': 'https://example.com/*', 'on': false, 'mode': 'delay'},
        {'url': '*/items/*', 'status': 404, 'body': 'gone'},
      ]);
      final post = Mocks.match('POST', url)!;
      expect(post.mode, DevpulMockMode.fail);
      expect(post.message, 'Mocked network failure');
      final get = Mocks.match('GET', url)!;
      expect(get.mode, DevpulMockMode.respond);
      expect(get.status, 404);
      expect(get.body, 'gone');
      expect(Mocks.match('GET', Uri.parse('https://example.com/other')), null);
    });

    test('glob characters other than * are literal', () async {
      await setRules([
        {'url': 'https://example.com/a?b=(1)'},
      ]);
      expect(
        Mocks.match('GET', Uri.parse('https://example.com/a?b=(1)')),
        isNotNull,
      );
      expect(Mocks.match('GET', Uri.parse('https://example.com/a?b=1')), null);
    });

    test('set returns them with ids and posts http.mocks', () async {
      final state = await setRules([
        {'url': '*', 'mode': 'pause', 'response': true, 'delayMs': 5},
      ]);
      final rules = (state! as Map)['rules'] as List;
      expect(rules.single, {
        'id': isA<String>(),
        'on': true,
        'method': null,
        'url': '*',
        'mode': 'pause',
        'delayMs': 0,
        'request': true,
        'response': true,
      });
      expect(last('http.mocks'), state);
      expect(await debugRunCall('http.mocks'), state);
    });

    test('reject bad rules and keep the old ones', () async {
      await setRules([
        {'id': 'a', 'url': '*'},
      ]);
      for (final bad in [
        {'url': ''},
        {'url': '*', 'mode': 'redirect'},
        {'url': '*', 'status': 99},
        {'url': '*', 'delayMs': -1},
        {'url': '*', 'mode': 'pause', 'request': false},
        {'url': 7},
      ]) {
        await expectLater(setRules([bad]), throwsFormatException);
      }
      await expectLater(
        setRules([
          {'id': 'x', 'url': '*'},
          {'id': 'x', 'url': '*'},
        ]),
        throwsFormatException,
      );
      expect(Mocks.rules.single.id, 'a');
    });

    test('apply only to mockable calls and mark their events', () async {
      await setRules([
        {'url': '*', 'mode': 'delay', 'delayMs': 1},
      ]);
      expect(DevpulHttp.request(method: 'GET', url: url)!.mock, null);
      final call = DevpulHttp.request(method: 'GET', url: url, mockable: true)!;
      expect(call.mock!.delay, const Duration(milliseconds: 1));
      call.response(status: 200);
      final posted = events.where((e) => e.$1 != 'http.mocks').toList();
      expect(posted[0].$2.containsKey('mock'), false);
      expect(posted[1].$2['mock'], 'delay');
      expect(posted[2].$2['mock'], 'delay');
    });
  });

  group('pause', () {
    test('holds the request event until resumed with edits', () async {
      Devpul.configure(
        DevpulConfig(
          console: ConsoleMode.off,
          redactHeaders: (_, h) => {
            for (final e in h.entries)
              e.key: e.key == 'authorization' ? '<redacted>' : e.value,
          },
        ),
      );
      await setRules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final call = DevpulHttp.request(
        method: 'POST',
        url: url,
        headers: {'authorization': 'Bearer secret', 'x-a': '1'},
        body: '{"n":1}',
        mockable: true,
      )!;
      final edit = call.pauseRequest(body: '{"n":1}');
      await pumpEventQueue();
      expect(kinds(), ['http.paused']);
      final paused = last('http.paused');
      expect(paused['stage'], 'request');
      expect(paused['headers'], {'authorization': '<redacted>', 'x-a': '1'});
      expect(paused['body'], '{"n":1}');
      expect(paused['editable'], true);
      expect((await debugRunCall('http.paused'))! as Map, {
        'paused': [paused],
      });

      await debugRunCall('http.resume', {
        'id': call.id,
        'url': 'https://example.com/items/8',
        'headers': {'authorization': '<redacted>', 'x-b': '2'},
        'body': '{"n":2}',
      });
      final result = await edit;
      expect(result.url, Uri.parse('https://example.com/items/8'));
      expect(result.headers, {'authorization': 'Bearer secret', 'x-b': '2'});
      expect(result.body, '{"n":2}');
      expect(result.method, null);
      expect(kinds(), ['http.paused', 'http.resumed', 'http.request']);
      expect(last('http.resumed')['how'], 'resumed');
      final request = last('http.request');
      expect(request['url'], 'https://example.com/items/8');
      expect(request['body'], {'n': 2});
      expect(request['mock'], 'pause');

      call.response(status: 200);
      expect(last('http.response')['url'], 'https://example.com/items/8');
    });

    test('maps and lists edit as JSON', () async {
      await setRules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final call = DevpulHttp.request(
        method: 'POST',
        url: url,
        body: {'n': 1},
        mockable: true,
      )!;
      final edit = call.pauseRequest(body: {'n': 1});
      await pumpEventQueue();
      expect(last('http.paused')['body'], '{\n  "n": 1\n}');
      expect(last('http.paused')['json'], true);
      await debugRunCall('http.resume', {'id': call.id});
      expect((await edit).changed, false);
    });

    test('a body that is not text shows read-only', () async {
      await setRules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final call = DevpulHttp.request(
        method: 'POST',
        url: url,
        body: [1, 2, 3],
        mockable: true,
      )!;
      final edit = call.pauseRequest();
      await pumpEventQueue();
      expect(last('http.paused')['editable'], false);
      await debugRunCall('http.resume', {'id': call.id, 'body': 'x'});
      expect((await edit).body, null);
    });

    test('abort', () async {
      await setRules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final call = DevpulHttp.request(method: 'GET', url: url, mockable: true)!;
      final edit = call.pauseRequest();
      await pumpEventQueue();
      await debugRunCall('http.resume', {'id': call.id, 'abort': true});
      expect((await edit).abort, true);
      expect(last('http.resumed')['how'], 'aborted');
    });

    test('nothing pauses without a listener', () async {
      debugListening = () => false;
      await setRules([
        {'url': '*', 'mode': 'pause', 'response': true},
      ]);
      final call = DevpulHttp.request(method: 'GET', url: url, mockable: true)!;
      expect(kinds(), ['http.request']);
      expect((await call.pauseRequest()).changed, false);
      expect((await call.pauseResponse(status: 200)).changed, false);
      expect(kinds(), ['http.request']);
    });

    test('released when the last listener leaves', () async {
      await setRules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final call = DevpulHttp.request(method: 'GET', url: url, mockable: true)!;
      final edit = call.pauseRequest();
      await pumpEventQueue();
      debugListening = () => false;
      expect((await edit).changed, false);
      expect(last('http.resumed')['how'], 'unwatched');
      expect(kinds().last, 'http.request');
      await expectLater(
        debugRunCall('http.resume', {'id': call.id}),
        throwsFormatException,
      );
    });

    test('released at the timeout', () async {
      final saved = pauseTimeout;
      addTearDown(() => pauseTimeout = saved);
      pauseTimeout = const Duration(milliseconds: 10);
      await setRules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final call = DevpulHttp.request(method: 'GET', url: url, mockable: true)!;
      expect((await call.pauseRequest()).changed, false);
      expect(last('http.resumed')['how'], 'timeout');
    });

    test('holds the response', () async {
      await setRules([
        {'url': '*', 'mode': 'pause', 'request': false, 'response': true},
      ]);
      final call = DevpulHttp.request(method: 'GET', url: url, mockable: true)!;
      expect(kinds(), ['http.request']);
      expect((await call.pauseRequest()).changed, false);
      final edit = call.pauseResponse(
        status: 500,
        headers: {'content-type': 'application/json'},
        body: '{"error":true}',
      );
      await pumpEventQueue();
      final paused = last('http.paused');
      expect(paused['stage'], 'response');
      expect(paused['status'], 500);
      expect(paused['body'], '{"error":true}');
      await debugRunCall('http.resume', {
        'id': call.id,
        'status': 200,
        'body': '{"error":false}',
      });
      final result = await edit;
      expect(result.status, 200);
      expect(result.body, '{"error":false}');
      expect(result.headers, null);
      call.response(status: result.status, body: result.body);
      expect(last('http.response')['mock'], 'pause');
      expect(last('http.response')['body'], {'error': false});
    });
  });
}
