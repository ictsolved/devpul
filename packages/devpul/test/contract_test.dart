@TestOn('vm')
library;

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugInfo, debugOnPost;
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
    );
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
    Devpul.error(
      StateError('boom'),
      stack,
      source: 'zone',
      library: 'sync',
      context: 'while syncing',
      information: 'widget: Cart',
      silent: true,
    );

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
