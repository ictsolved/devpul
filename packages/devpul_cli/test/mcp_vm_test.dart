@TestOn('vm')
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:dart_mcp/client.dart';
import 'package:dart_mcp/stdio.dart';
import 'package:test/test.dart';

final devpul = File('bin/devpul.dart').absolute.path;

/// `devpul mcp` with [args], connected and initialized.
Future<ServerConnection> startMcp(
  List<String> args, {
  Map<String, String>? environment,
}) async {
  final process = await Process.start(Platform.resolvedExecutable, [
    devpul,
    'mcp',
    ...args,
  ], environment: environment);
  addTearDown(process.kill);
  process.stderr.transform(utf8.decoder).listen(stderr.write);
  final client = MCPClient(Implementation(name: 'test', version: '0'));
  final server = client.connectServer(
    stdioChannel(input: process.stdout, output: process.stdin),
  );
  addTearDown(server.shutdown);
  await server.initialize(
    InitializeRequest(
      protocolVersion: ProtocolVersion.latestSupported,
      capabilities: client.capabilities,
      clientInfo: client.implementation,
    ),
  );
  server.notifyInitialized();
  return server;
}

Future<(String, bool)> call(
  ServerConnection server,
  String tool, [
  Map<String, Object?> args = const {},
]) async {
  final result = await server.callTool(
    CallToolRequest(name: tool, arguments: args),
  );
  return ((result.content.single as TextContent).text, result.isError ?? false);
}

Future<String> text(
  ServerConnection server,
  String tool, [
  Map<String, Object?> args = const {},
]) async {
  final (out, error) = await call(server, tool, args);
  expect(error, isFalse, reason: out);
  return out;
}

Future<Map<String, Object?>> json(
  ServerConnection server,
  String tool, [
  Map<String, Object?> args = const {},
]) async => jsonDecode(await text(server, tool, args)) as Map<String, Object?>;

int idOf(String line) => int.parse(line.split(' ').first);

void main() {
  late String vmUrl;
  late Directory dir;

  setUpAll(() async {
    dir = await Directory.systemTemp.createTemp('devpul_mcp');
    addTearDown(() => dir.delete(recursive: true));
    final info = File('${dir.path}/info.json');
    final app = await Process.start(Platform.resolvedExecutable, [
      '--enable-vm-service=0',
      '--write-service-info=${info.uri}',
      'test/mcp/app.dart',
    ]);
    addTearDown(app.kill);
    unawaited(app.stdout.drain<void>());
    while (!info.existsSync() || info.lengthSync() == 0) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    vmUrl = (jsonDecode(info.readAsStringSync()) as Map)['uri'] as String;
  });

  test('serves every tool from the app', () async {
    final server = await startMcp([vmUrl]);
    final tools = await server.listTools(ListToolsRequest());
    expect(tools.tools.map((t) => t.name), [
      'get_session',
      'list_requests',
      'get_request',
      'list_errors',
      'list_logs',
      'list_events',
      'get_event',
      'run_action',
      'call_plugin',
      'call_plugin_write',
    ]);

    final session = await json(server, 'get_session');
    expect(session, containsPair('connected', true));
    expect(session['app'], {'name': 'shop', 'version': '2.0.0'});
    expect(session['actions'], [
      {
        'name': 'add items',
        'params': [
          {'name': 'count', 'type': 'number', 'initial': 1},
        ],
      },
    ]);
    expect(session['plugins'], [
      {
        'id': 'cart',
        'description': 'The cart.',
        'handlers': [
          {
            'name': 'cart.items',
            'description': 'Skus in the cart.',
            'tool': 'call_plugin',
          },
          {'name': 'cart.clear', 'tool': 'call_plugin_write'},
          {'name': 'cart.token', 'tool': 'call_plugin_write'},
        ],
      },
    ]);
    expect(session['handlers'], [
      {'name': 'flags.list', 'tool': 'call_plugin'},
    ]);
    expect(session['runs'], [containsPair('run', 1)]);

    final requests = (await text(server, 'list_requests')).split('\n');
    expect(requests, [
      matches(
        r'^\d+ [\d:.]+ POST 201 \d+ms [\d.]+kB https://api\.example\.com/cart\?id=1$',
      ),
      matches(
        r'^\d+ [\d:.]+ GET failed \d+ms https://cdn\.example\.com/banner\.png$',
      ),
    ]);
    expect(await text(server, 'list_requests', {'status_min': 400}), 'None.');
    expect(
      (await text(server, 'list_requests', {'state': 'failed'})).split('\n'),
      [contains('banner.png')],
    );
    expect(
      (await text(server, 'list_requests', {'text': 'sku-1'})).split('\n'),
      [contains('/cart')],
    );
    final first = idOf(requests.first);
    expect(
      (await text(server, 'list_requests', {'since': first})).split('\n'),
      [contains('banner.png')],
    );
    expect((await text(server, 'list_requests', {'limit': 1})).split('\n'), [
      contains('banner.png'),
      '1 older; pass before: ${idOf(requests.last)}.',
    ]);

    final request = await json(server, 'get_request', {
      'id': first,
      'max_chars': 500,
    });
    expect(request, containsPair('status', 201));
    expect((request['request']! as Map)['body'], {'sku': 'abc-1'});
    final response = request['response']! as Map;
    expect((response['body']! as Map)['items'], hasLength(500));
    expect(response['cut'], {'body.items': startsWith('first 500 of ')});

    final errors = (await text(server, 'list_errors')).split('\n');
    expect(errors, [
      matches(
        r'^\d+ [\d:.]+ StateError: Bad state: cart is empty \(route /cart\)$',
      ),
    ]);
    final error = await json(server, 'get_event', {'id': idOf(errors.single)});
    expect(error['kind'], 'error');
    expect((error['data']! as Map)['stack'], contains('test/mcp/app.dart'));
    final before = error['before']! as List<Object?>;
    expect(before.first, matches(r'^\d+ -\d+ms cart\.updated items: 1$'));
    // developer.log and Devpul.log are two sessions; in one millisecond
    // their order is a tie.
    expect(before, [
      ...List.filled(5, anything),
      matches(r'^\d+ -\d+ms push /cart$'),
    ]);
    expect(
      before,
      unorderedMatches([
        startsWith(before.first! as String),
        matches(r'^request \d+ -\d+ms GET failed https://cdn'),
        matches(r'^request \d+ -\d+ms POST 201 https://api'),
        matches(r'^\d+ -\d+ms severe order x+$'),
        matches(r'^\d+ -\d+ms info cart opened$'),
        matches(r'^\d+ -\d+ms push /cart$'),
      ]),
    );

    final logs = (await text(server, 'list_logs')).split('\n');
    expect(logs, [
      matches(r'^\d+ [\d:.]+ info cart opened$'),
      matches(
        r'^\d+ [\d:.]+ severe \[orders\] order x{122} \[cut; get_event reads it all\]$',
      ),
    ]);
    expect(
      (await text(server, 'list_logs', {'min_level': 'error'})).split('\n'),
      [contains('[orders]')],
    );
    final log = await json(server, 'get_event', {'id': idOf(logs.last)});
    expect((log['data']! as Map)['message'], 'order ${'x' * 300}');

    expect((await text(server, 'list_events')).split('\n'), [
      matches(r'^\d+ [\d:.]+ route action: push, route: /cart$'),
      matches(r'^\d+ [\d:.]+ cart\.updated items: 1$'),
    ]);
    expect((await text(server, 'list_events', {'kind': 'cart'})).split('\n'), [
      contains('cart.updated'),
    ]);

    expect(
      await json(server, 'run_action', {
        'name': 'add items',
        'args': {'count': 3},
      }),
      {'result': 3},
    );
    final (unknown, failed) = await call(server, 'run_action', {
      'name': 'drop tables',
    });
    expect(failed, isTrue);
    expect(unknown, 'No action "drop tables". Actions: add items.');

    expect(await json(server, 'call_plugin', {'name': 'cart.items'}), {
      'result': ['sku-1'],
    });
    expect(await json(server, 'call_plugin_write', {'name': 'cart.token'}), {
      'result': 'secret',
    });
    for (final (tool, name, message) in [
      (
        'call_plugin',
        'cart.clear',
        'cart.clear changes the app; call it '
            'with call_plugin_write.',
      ),
      (
        'call_plugin',
        'cart.token',
        'cart.token returns secrets or acts on '
            'the app; call it with call_plugin_write.',
      ),
      (
        'call_plugin_write',
        'cart.items',
        'cart.items only reads; call it '
            'with call_plugin.',
      ),
      (
        'call_plugin',
        'cart.nope',
        'No handler "cart.nope". get_session '
            'lists them.',
      ),
    ]) {
      expect(await call(server, tool, {'name': name}), (message, true));
    }
    expect(await json(server, 'call_plugin_write', {'name': 'cart.clear'}), {
      'result': null,
    });
    expect(await json(server, 'call_plugin', {'name': 'cart.items'}), {
      'result': <Object?>[],
    });

    final (missing, notFound) = await call(server, 'get_request', {'id': 999});
    expect(notFound, isTrue);
    expect(missing, contains('No request 999'));
  });

  test('follows the app of the devpul serving the UI', () async {
    final env = {'XDG_CACHE_HOME': dir.path};
    final ui = await Process.start(Platform.resolvedExecutable, [
      devpul,
      '--port=0',
      '--no-open',
      vmUrl,
    ], environment: env);
    addTearDown(ui.kill);
    // Read to the end: a closed pipe would stop it at its next line.
    final port = Completer<String>();
    ui.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((
      line,
    ) {
      final match = RegExp(
        r'UI at http://127\.0\.0\.1:(\d+)/',
      ).firstMatch(line);
      if (match != null) port.complete(match[1]);
    });
    final server = await startMcp([
      '--port=${await port.future}',
    ], environment: env);
    final session = await json(server, 'get_session');
    expect(session['vmServiceUrl'], vmUrl);
    expect(session['app'], containsPair('name', 'shop'));
  });

  test('says how to connect when there is no app', () async {
    final server = await startMcp(
      ['--port=1'],
      environment: {'XDG_CACHE_HOME': dir.path},
    );
    final (out, error) = await call(server, 'list_errors');
    expect(error, isTrue);
    expect(out, startsWith('No app is connected.'));
  });
}
