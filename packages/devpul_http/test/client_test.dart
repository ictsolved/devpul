import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunCall;
import 'package:devpul/src/mock.dart';
import 'package:devpul_http/devpul_http.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';

void main() {
  final events = <(String, Map<String, Object?>)>[];

  setUp(() {
    events.clear();
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugOnPost = (kind, event) =>
        events.add((kind, event['data']! as Map<String, Object?>));
  });

  DevpulClient client(MockClientHandler handler) =>
      DevpulClient(MockClient(handler));

  test(
    'pairs request and response and keeps the body for the caller',
    () async {
      final c = client(
        (_) async => http.Response(
          jsonEncode({'id': 7}),
          200,
          headers: {'content-type': 'application/json'},
        ),
      );
      final res = await c.post(
        Uri.parse('https://example.com/items?q=a'),
        headers: {'content-type': 'application/json'},
        body: jsonEncode({'sku': 'abc'}),
      );
      expect(jsonDecode(res.body), {'id': 7});
      final [(k1, req), (k2, end)] = events;
      expect(k1, 'http.request');
      expect(k2, 'http.response');
      expect(req['method'], 'POST');
      expect(req['url'], 'https://example.com/items?q=a');
      expect(req['params'], {'q': 'a'});
      expect(req['body'], {'sku': 'abc'});
      expect(req['curl'], contains('--data-raw'));
      expect(end['id'], req['id']);
      expect(end['status'], 200);
      expect(end['body'], {'id': 7});
    },
  );

  test('shows form fields and multipart files', () async {
    final c = client((_) async => http.Response('', 204));
    await c.post(Uri.parse('https://example.com/f'), body: {'a': '1'});
    expect(events.first.$2['body'], {'a': '1'});

    events.clear();
    final multi =
        http.MultipartRequest('POST', Uri.parse('https://example.com/u'))
          ..fields['note'] = 'hi'
          ..files.add(
            http.MultipartFile.fromBytes('file', [1, 2], filename: 'a.png'),
          );
    await c.send(multi);
    expect(events.first.$2['body'], {'note': 'hi', 'file': 'a.png'});
    expect(events.last.$2['body'], isNull);
  });

  test('binary bodies show as a byte count, images as a data URL', () async {
    final c = client(
      (r) async => http.Response.bytes(
        [0xff, 0xfe, 0x00],
        200,
        headers: {
          'content-type': r.url.path.endsWith('.png')
              ? 'image/png'
              : 'application/octet-stream',
        },
      ),
    );
    final res = await c.get(Uri.parse('https://example.com/i.png'));
    expect(res.bodyBytes, [0xff, 0xfe, 0x00]);
    expect(events.last.$2['body'], 'data:image/png;base64,//4A');
    await c.get(Uri.parse('https://example.com/i.bin'));
    expect(events.last.$2['body'], '<3 bytes>');
  });

  test('reports client exceptions and rethrows', () async {
    final c = client((_) async => throw http.ClientException('refused'));
    await expectLater(
      c.get(Uri.parse('https://example.com/x')),
      throwsA(isA<http.ClientException>()),
    );
    final (kind, err) = events.last;
    expect(kind, 'http.error');
    expect(err['errorType'], 'ClientException');
    expect(err['message'], contains('refused'));
  });

  test('skips ignored requests entirely', () async {
    Devpul.configure(
      const DevpulConfig(console: ConsoleMode.off, ignoreUrls: ['/health']),
    );
    final c = client((_) async => http.Response('ok', 200));
    expect((await c.get(Uri.parse('https://example.com/health'))).body, 'ok');
    expect(events, isEmpty);
  });

  group('mocks', () {
    final url = Uri.parse('https://example.com/items/7');

    Future<void> rules(List<Map<String, Object?>> rules) async {
      await debugRunCall('http.mocks.set', {'rules': rules});
      events.removeWhere((e) => e.$1 == 'http.mocks');
    }

    Map<String, Object?> last(String kind) =>
        events.lastWhere((e) => e.$1 == kind).$2;

    // Resumes the next pause with [args].
    Future<void> resume(Map<String, Object?> args) async {
      while (!events.any((e) => e.$1 == 'http.paused')) {
        await Future<void>.delayed(Duration.zero);
      }
      final id = last('http.paused')['id'];
      events.removeWhere((e) => e.$1 == 'http.paused');
      await debugRunCall('http.resume', {'id': id, ...args});
    }

    setUpAll(() => Mocks.register(Devpul.handle));
    setUp(() => debugListening = () => true);
    tearDown(() => rules([]));

    test('respond without sending', () async {
      await rules([
        {
          'url': '*/items/*',
          'status': 404,
          'headers': {'content-type': 'application/json'},
          'body': '{"error":"gone"}',
        },
      ]);
      final c = client((_) => fail('sent'));
      final res = await c.get(url);
      expect(res.statusCode, 404);
      expect(res.body, '{"error":"gone"}');
      expect(res.headers['content-type'], 'application/json');
      expect(last('http.response')['mock'], 'respond');
      expect(last('http.response')['body'], {'error': 'gone'});
    });

    test('fail as a ClientException', () async {
      await rules([
        {'url': '*', 'mode': 'fail', 'message': 'offline'},
      ]);
      final c = client((_) => fail('sent'));
      await expectLater(
        c.get(url),
        throwsA(
          isA<http.ClientException>().having(
            (e) => e.message,
            'message',
            'offline',
          ),
        ),
      );
      expect(last('http.error')['mock'], 'fail');
      expect(last('http.error')['message'], 'offline');
    });

    test('delay and send', () async {
      await rules([
        {'url': '*', 'mode': 'delay', 'delayMs': 20},
      ]);
      final watch = Stopwatch()..start();
      final c = client((_) async => http.Response('ok', 200));
      expect((await c.get(url)).body, 'ok');
      expect(watch.elapsedMilliseconds, greaterThanOrEqualTo(20));
      expect(last('http.response')['mock'], 'delay');
    });

    test('rules skip calls that do not match', () async {
      await rules([
        {'url': 'https://example.com/other', 'mode': 'fail'},
        {'url': '*', 'method': 'POST', 'mode': 'fail'},
      ]);
      final c = client((_) async => http.Response('ok', 200));
      expect((await c.get(url)).body, 'ok');
      expect(last('http.response').containsKey('mock'), false);
    });

    test('edit the request at a breakpoint', () async {
      await rules([
        {'url': '*', 'mode': 'pause'},
      ]);
      late http.Request sent;
      final c = client((r) async {
        sent = r;
        return http.Response('ok', 200);
      });
      final res = c.post(
        url,
        headers: {'content-type': 'application/json', 'x-a': '1'},
        body: '{"n":1}',
      );
      await resume({
        'method': 'PUT',
        'url': 'https://example.com/items/8',
        'headers': {'content-type': 'application/json', 'x-b': '2'},
        'body': '{"n":2}',
      });
      expect((await res).body, 'ok');
      expect(sent.method, 'PUT');
      expect(sent.url, Uri.parse('https://example.com/items/8'));
      expect(sent.headers['x-b'], '2');
      expect(sent.headers.containsKey('x-a'), false);
      expect(sent.body, '{"n":2}');
      expect(last('http.request')['method'], 'PUT');
      expect(last('http.request')['mock'], 'pause');

      // A replay sends what was sent, past the breakpoint.
      await rules([]);
      await debugRunCall('http.replay', {'id': last('http.request')['id']});
      await pumpEventQueue();
      expect(sent.method, 'PUT');
      expect(sent.url, Uri.parse('https://example.com/items/8'));
      expect(sent.body, '{"n":2}');
    });

    test(
      'a multipart request keeps its boundary after a header edit',
      () async {
        await rules([
          {'url': '*', 'mode': 'pause'},
        ]);
        late http.Request sent;
        final c = client((r) async {
          sent = r;
          return http.Response('', 204);
        });
        final multi = http.MultipartRequest('POST', url)..fields['note'] = 'hi';
        final res = c.send(multi);
        await resume({
          'headers': {'x-b': '2'},
        });
        await res;
        expect(
          sent.headers['content-type'],
          startsWith('multipart/form-data; boundary='),
        );
        expect(sent.headers['x-b'], '2');
        expect(sent.body, contains('name="note"'));
      },
    );

    test('edit the response at a breakpoint', () async {
      await rules([
        {'url': '*', 'mode': 'pause', 'request': false, 'response': true},
      ]);
      final c = client(
        (_) async => http.Response(
          '{"ok":false}',
          500,
          headers: {'content-length': '12'},
        ),
      );
      final res = c.get(url);
      await resume({'status': 200, 'body': '{"ok":true}'});
      final done = await res;
      expect(done.statusCode, 200);
      expect(done.body, '{"ok":true}');
      expect(done.contentLength, 11);
      expect(last('http.response')['status'], 200);
      expect(last('http.response')['mock'], 'pause');
    });

    test('abort at a breakpoint', () async {
      await rules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final c = client((_) => fail('sent'));
      final res = expectLater(c.get(url), throwsA(isA<http.ClientException>()));
      await resume({'abort': true});
      await res;
      expect(last('http.error')['mock'], 'pause');
    });
  });

  group('replay', () {
    test('sends the request again through the inner client', () async {
      final sent = <http.Request>[];
      final c = client((request) async {
        sent.add(request);
        return http.Response('ok ${sent.length}', 200);
      });
      await c.post(
        Uri.parse('https://example.com/items'),
        headers: {'x-a': '1', 'content-type': 'text/plain'},
        body: 'one',
      );
      final first = events.first.$2;
      expect(first['replayable'], true);
      expect(await debugRunCall('http.sent', {'id': first['id']}), {
        'id': first['id'],
        'method': 'POST',
        'url': 'https://example.com/items',
        'headers': {'x-a': '1', 'content-type': 'text/plain; charset=utf-8'},
        'body': 'one',
        'editable': true,
      });

      events.clear();
      final result = await debugRunCall('http.replay', {
        'id': first['id'],
        'url': 'https://example.com/items/2',
        'body': 'two',
      });
      await pumpEventQueue();
      final [(_, req), (_, end)] = events;
      expect(result, {'id': req['id']});
      expect(req['cause'], {'type': 'replay', 'id': first['id']});
      expect(req['url'], 'https://example.com/items/2');
      expect(end['body'], 'ok 2');
      expect(sent.last.url, Uri.parse('https://example.com/items/2'));
      expect(sent.last.body, 'two');
      expect(sent.last.headers['x-a'], '1');
    });

    test('streamed and multipart requests are not replayable', () async {
      final c = client((_) async => http.Response('', 204));
      await c.send(
        http.MultipartRequest('POST', Uri.parse('https://example.com/f'))
          ..fields['a'] = '1',
      );
      expect(events.first.$2.containsKey('replayable'), false);
    });
  });
}
