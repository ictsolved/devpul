@TestOn('vm')
library;

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart'
    show debugInfo, debugOnPost, debugRunCall;
import 'package:devpul/src/mock.dart' show debugListening;
import 'package:test/test.dart';

import 'golden.dart';

// Every kind the core posts, in the shape ext.devpul.backlog serves.
void main() {
  test('events match contract/events.json', () async {
    final events = <Map<String, Object?>>[];
    debugOnPost = (kind, event) =>
        events.add({'kind': 'devpul.$kind', 'data': event});
    final stack = StackTrace.fromString('#0      main (file:///app.dart:1:1)');

    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    Devpul.session({'name': 'Shop', 'version': '2.3.1'}, tags: {'env': 'dev'});
    Devpul.action('Clear cache', (_) => null);
    Devpul.action(
      'Seed',
      (args) => args,
      params: const [
        DevpulParam.text('name', initial: 'demo'),
        DevpulParam.number('count', initial: 3),
        DevpulParam.flag('clear'),
        DevpulParam.choice('env', ['dev', 'prod']),
      ],
    );
    Devpul.plugin(
      'my_plugin',
      () => 'export default {}',
      version: '1.0.0',
      origin: 'https://example.com/my_plugin.git',
      description: 'Cart contents and totals in a Cart tab.',
    );
    Devpul.handle(
      'my_plugin.items',
      (_) => const <Object?>[],
      description: 'Items in the cart.',
    );
    Devpul.handle('my_plugin.clear', (_) => null, writes: true);
    Devpul.handle('my_plugin.token', (_) => null, sensitive: true);
    Devpul.limit('frame', 0);
    await pumpEventQueue();

    Devpul.log('Signed in', name: 'auth');
    Devpul.log(
      'Sync failed',
      level: 'error',
      name: 'sync',
      error: const FormatException('bad'),
      stack: stack,
    );
    Devpul.route = () => '/cart';
    Devpul.error(
      StateError('boom'),
      stack,
      source: 'zone',
      library: 'sync',
      context: 'while syncing',
      information: 'widget: Cart',
      silent: true,
    );
    Devpul.route = null;

    DevpulHttp.request(
      method: 'post',
      url: Uri.parse('https://example.com/items?page=1&tag=a&tag=b'),
      headers: {
        'content-type': ['application/json'],
        'accept': ['a', 'b'],
      },
      body: '{"sku":"abc-1","qty":2}',
    )?.response(
      status: 201,
      statusMessage: 'Created',
      headers: {'content-type': 'application/json', 'content-length': '11'},
      body: {'ok': true},
      finalUrl: Uri.parse('/items/7'),
    );
    DevpulHttp.request(
      method: 'GET',
      url: Uri.parse('https://example.com/slow'),
    )?.error(errorType: 'receiveTimeout', message: 'Timed out');
    DevpulHttp.request(
      method: 'POST',
      url: Uri.parse('https://example.com/upload'),
      body: const DevpulForm(
        fields: [MapEntry('note', "it's")],
        files: [MapEntry('file', 'photo.png')],
      ),
    )?.response(status: 500, body: '<3 bytes>');

    debugListening = () => true;
    await debugRunCall('http.mocks.set', {
      'rules': [
        {
          'id': 'flags',
          'method': 'GET',
          'url': 'https://example.com/flags*',
          'headers': {'content-type': 'application/json'},
          'body': '{"beta":true}',
        },
        {'id': 'offline', 'on': false, 'url': '*', 'mode': 'fail'},
        {
          'id': 'checkout',
          'url': '*/checkout',
          'mode': 'pause',
          'response': true,
        },
      ],
    });
    DevpulHttp.request(
      method: 'GET',
      url: Uri.parse('https://example.com/flags'),
      mockable: true,
    )?.response(
      status: 200,
      headers: {'content-type': 'application/json'},
      body: '{"beta":true}',
    );
    final checkout = DevpulHttp.request(
      method: 'POST',
      url: Uri.parse('https://example.com/checkout'),
      headers: {'content-type': 'application/json'},
      body: '{"cart":1}',
      mockable: true,
    )!;
    final sent = checkout.pauseRequest(body: '{"cart":1}');
    await pumpEventQueue();
    await debugRunCall('http.resume', {
      'id': checkout.id,
      'body': '{"cart":2}',
    });
    await sent;
    final returned = checkout.pauseResponse(
      status: 402,
      headers: {'content-type': 'application/json'},
      body: '{"error":"card"}',
    );
    await pumpEventQueue();
    await debugRunCall('http.resume', {
      'id': checkout.id,
      'status': 200,
      'body': '{"ok":true}',
    });
    final edit = await returned;
    checkout.response(
      status: edit.status,
      headers: {'content-type': 'application/json'},
      body: edit.body,
    );
    await debugRunCall('http.mocks.set', {'rules': <Object?>[]});

    final pay = Uri.parse('https://example.com/pay');
    final paid = DevpulCause('cart.checkout', {'items': 2}).run(
      () => DevpulHttp.request(
        method: 'POST',
        url: pay,
        body: '{"total":42}',
        replayBody: '{"total":42}',
        replay: (_) async {
          DevpulHttp.request(method: 'POST', url: pay)?.response(status: 200);
        },
      ),
    )!..response(status: 502);
    await debugRunCall('http.replay', {'id': paid.id});

    Devpul.emit('cart.updated', {
      'items': 3,
      'total': 42.5,
      'when': DateTime.utc(2026),
    });
    Devpul.emit('frame', {});
    Devpul.configure(
      const DevpulConfig(console: ConsoleMode.off, maxValueLength: 16),
    );
    Devpul.emit('big', {
      'body': 'x' * 40,
      'list': [for (var i = 0; i < 10; i++) i],
    });

    expectGolden('events.json', normalize(events));
  });

  test('handshake matches contract/info.json', () {
    expectGolden('info.json', normalize(debugInfo()));
  });
}
