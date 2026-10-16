import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart'
    show debugOnPost, debugRunAction, debugRunCall;
import 'package:devpul/src/http.dart' show Replays;
import 'package:devpul/src/mock.dart';
import 'package:test/test.dart';

void main() {
  final events = <(String, Map<String, Object?>, int)>[];
  final url = Uri.parse('https://example.com/items?page=1');

  Map<String, Object?> last(String kind) =>
      events.lastWhere((e) => e.$1 == kind).$2;

  setUpAll(() {
    Mocks.register(Devpul.handle);
    Replays.register(Devpul.handle);
  });

  setUp(() {
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugListening = () => true;
    events.clear();
    debugOnPost = (kind, event) => events.add((
      kind,
      event['data']! as Map<String, Object?>,
      event['seq']! as int,
    ));
  });

  // Sends through [DevpulHttp.request] the way an adapter does, recording
  // the edit each replay gets.
  DevpulHttpCall? send(
    List<DevpulHttpEdit> edits, {
    String method = 'POST',
    Uri? to,
    Map<String, Object?> headers = const {},
    Object? body = '{"qty":1}',
  }) {
    late final DevpulHttpCall? call;
    call = DevpulHttp.request(
      method: method,
      url: to ?? url,
      headers: headers,
      body: body,
      replayBody: body,
      replay: (edit) async {
        edits.add(edit);
        send(
          edits,
          method: edit.method ?? call!.method,
          to: edit.url ?? call!.url,
          headers: edit.headers ?? headers,
          body: edit.body ?? body,
        )?.response(status: 200);
      },
    );
    return call;
  }

  test('a call with replay says so and is sent again under a cause', () async {
    final edits = <DevpulHttpEdit>[];
    final call = send(edits)!;
    call.response(status: 201);
    expect(last('http.request')['replayable'], true);
    expect(last('http.request').containsKey('cause'), false);

    final result = await debugRunCall('http.replay', {'id': call.id});
    final again = (result! as Map)['id'];
    expect(again, isNot(call.id));
    expect(edits.single.changed, false);
    final request = last('http.request');
    expect(request['id'], again);
    expect(request['method'], 'POST');
    expect(request['cause'], {'type': 'replay', 'id': call.id});
    expect(last('http.response')['id'], again);
  });

  test(
    'replay applies edits; a redacted header sent back keeps its value',
    () async {
      Devpul.configure(
        DevpulConfig(
          console: ConsoleMode.off,
          redactHeaders: (_, h) => {
            for (final MapEntry(:key, :value) in h.entries)
              key: key == 'authorization' ? '***' : value,
          },
        ),
      );
      final edits = <DevpulHttpEdit>[];
      final call = send(
        edits,
        headers: {'authorization': 'Bearer secret', 'accept': 'json'},
      )!;

      final sent = await debugRunCall('http.sent', {'id': call.id});
      expect(sent, {
        'id': call.id,
        'method': 'POST',
        'url': url.toString(),
        'headers': {'authorization': '***', 'accept': 'json'},
        'body': '{"qty":1}',
        'editable': true,
      });

      await debugRunCall('http.replay', {
        'id': call.id,
        'method': 'put',
        'url': 'https://example.com/items/2',
        'headers': {'authorization': '***', 'accept': 'text'},
        'body': '{"qty":2}',
      });
      final edit = edits.single;
      expect(edit.method, 'put');
      expect(edit.url, Uri.parse('https://example.com/items/2'));
      expect(edit.headers, {
        'authorization': 'Bearer secret',
        'accept': 'text',
      });
      expect(edit.body, '{"qty":2}');
      expect(last('http.request')['method'], 'PUT');
    },
  );

  test(
    'a body edited at a breakpoint is what replay sends and shows',
    () async {
      await debugRunCall('http.mocks.set', {
        'rules': [
          {'url': '*', 'mode': 'pause'},
        ],
      });
      addTearDown(() => debugRunCall('http.mocks.set', {'rules': <Object?>[]}));
      final call = DevpulHttp.request(
        method: 'POST',
        url: url,
        body: 'a',
        mockable: true,
        replayBody: 'a',
        replay: (_) async {},
      )!;
      final paused = call.pauseRequest(body: 'a');
      await pumpEventQueue();
      await debugRunCall('http.resume', {'id': call.id, 'body': 'b'});
      await paused;
      final sent = await debugRunCall('http.sent', {'id': call.id});
      expect((sent! as Map)['body'], 'b');
    },
  );

  test('calls without replay, and the oldest past 100, are not kept', () async {
    final plain = DevpulHttp.request(method: 'GET', url: url)!;
    expect(last('http.request').containsKey('replayable'), false);
    expect(
      () => debugRunCall('http.replay', {'id': plain.id}),
      throwsA(isA<FormatException>()),
    );

    final first = send([])!;
    for (var i = 0; i < 100; i++) {
      send([]);
    }
    expect(
      () => debugRunCall('http.sent', {'id': first.id}),
      throwsA(isA<FormatException>()),
    );
  });

  test('a replay that fails before it sends returns the error', () async {
    final call = DevpulHttp.request(
      method: 'GET',
      url: url,
      replay: (_) async => throw StateError('closed'),
    )!;
    expect(
      () => debugRunCall('http.replay', {'id': call.id}),
      throwsA(isA<StateError>()),
    );
  });

  test('a replay the app ignores returns no id', () async {
    final call = send([])!;
    Devpul.configure(
      DevpulConfig(console: ConsoleMode.off, ignoreUrls: [url.host]),
    );
    expect(await debugRunCall('http.replay', {'id': call.id}), isEmpty);
  });

  group('DevpulCause', () {
    test('posts its event and names it on calls made in run', () async {
      final cause = DevpulCause('cart.checkout', {'items': 3});
      final (kind, data, seq) = events.last;
      expect(kind, 'cart.checkout');
      expect(data, {'items': 3});

      await cause.run(() async {
        DevpulHttp.request(method: 'GET', url: url);
        await Future<void>.delayed(Duration.zero);
        DevpulHttp.request(method: 'GET', url: url);
      });
      DevpulHttp.request(method: 'GET', url: url);
      final requests = [
        for (final e in events)
          if (e.$1 == 'http.request') e.$2['cause'],
      ];
      expect(requests, [
        {'type': 'event', 'kind': 'cart.checkout', 'seq': seq},
        {'type': 'event', 'kind': 'cart.checkout', 'seq': seq},
        null,
      ]);
    });

    test('a muted event still names its kind', () {
      Devpul.limit('muted', 0);
      addTearDown(() => Devpul.limit('muted', null));
      DevpulCause(
        'muted',
        {},
      ).run(() => DevpulHttp.request(method: 'GET', url: url));
      expect(last('http.request')['cause'], {'type': 'event', 'kind': 'muted'});
    });

    test('run returns what the body returns, null included', () {
      var runs = 0;
      expect(DevpulCause('a', {}).run<int?>(() => null), null);
      DevpulCause('a', {}).run(() => runs++);
      expect(runs, 1);
    });
  });

  test('actions run from the UI name themselves', () async {
    Devpul.action(
      'Sync',
      (_) => DevpulHttp.request(method: 'POST', url: url)?.id,
    );
    await debugRunAction('Sync');
    expect(last('http.request')['cause'], {'type': 'action', 'name': 'Sync'});
  });
}
