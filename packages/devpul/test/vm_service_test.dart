@TestOn('vm')
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

import 'golden.dart';

void main() {
  late Process app;
  late VmService service;
  late String isolateId;
  late Uri serviceUri;
  final events = <String, Map<String, Object?>>{};
  final output = <String>[];
  final logs = <Event>[];

  setUpAll(() async {
    final dir = await Directory.systemTemp.createTemp('devpul_e2e');
    addTearDown(() => dir.delete(recursive: true));
    final info = File('${dir.path}/info.json');
    app = await Process.start(Platform.resolvedExecutable, [
      '--enable-vm-service=0',
      '--write-service-info=${info.uri}',
      '--pause-isolates-on-start',
      'test/vm/app.dart',
    ]);
    addTearDown(app.kill);
    app.stdout
        .transform(utf8.decoder)
        .transform(const LineSplitter())
        .listen(output.add);

    while (!info.existsSync() || info.lengthSync() == 0) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    serviceUri = Uri.parse(
      (jsonDecode(info.readAsStringSync()) as Map)['uri'] as String,
    );
    service = await vmServiceConnectUri(
      serviceUri.replace(scheme: 'ws', path: '${serviceUri.path}ws').toString(),
    );
    addTearDown(service.dispose);

    while (true) {
      final isolates = (await service.getVM()).isolates ?? [];
      if (isolates.isNotEmpty) {
        isolateId = isolates.first.id!;
        final isolate = await service.getIsolate(isolateId);
        if (isolate.pauseEvent?.kind == EventKind.kPauseStart) break;
      }
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }

    final error = Completer<void>();
    service.onExtensionEvent.listen((e) {
      events[e.extensionKind!] = e.extensionData!.data.cast();
      if (e.extensionKind == 'devpul.error') error.complete();
    });
    await service.streamListen(EventStreams.kExtension);
    service.onLoggingEvent.listen(logs.add);
    await service.streamListen(EventStreams.kLogging);
    await service.resume(isolateId);
    await error.future.timeout(const Duration(seconds: 10));
  });

  test('streams events with the envelope', () {
    expect(events.keys, [
      'devpul.app.session',
      'devpul.log',
      'devpul.http.request',
      'devpul.http.response',
      'devpul.app.info',
      'devpul.error',
    ]);
    final session = events['devpul.app.session']!['session'];
    for (final event in events.values) {
      expect(event['v'], 1);
      expect(event['session'], session);
      expect(event['tags'], {'flavor': 'test'});
    }
    Object? data(String kind) => events[kind]!['data'];
    expect(data('devpul.log'), containsPair('message', 'hello'));
    expect(data('devpul.http.request'), containsPair('method', 'GET'));
    expect(data('devpul.http.response'), containsPair('status', 200));
    expect(data('devpul.error'), containsPair('message', 'Bad state: boom'));
  });

  test(
    'streams developer.log records, matching contract/logging.json',
    () async {
      while (logs.length < 2) {
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
      // Devpul.log goes over postEvent only, so the UI shows it once.
      expect(logs.map((e) => e.logRecord!.message!.valueAsString), [
        'token refresh failed',
        startsWith('{"items": '),
      ]);
      final message = logs[1].logRecord!.message!;
      expect(message.valueAsStringIsTruncated, isTrue);
      final getObject = {
        'objectId': message.id,
        'offset': 0,
        'count': message.length,
      };
      final full = await service.getObject(
        isolateId,
        message.id!,
        offset: 0,
        count: message.length,
      );
      final record = logs[0].logRecord!;
      final invoke = [
        for (final target in [record.error!, record.stackTrace!])
          {
            'request': {
              'targetId': target.id,
              'selector': 'toString',
              'argumentIds': <String>[],
            },
            'result': (await service.invoke(
              isolateId,
              target.id!,
              'toString',
              [],
            )).toJson(),
          },
      ];
      expect((full as Instance).valueAsString, hasLength(message.length));
      expect(invoke.map((i) => (i['result']! as Map)['valueAsString']), [
        'Bad state: expired',
        '#0      main (file:///app/main.dart:5:3)',
      ]);
      final ids = <String, String>{};
      expectGolden('logging.json', {
        'events': [
          for (final (i, e) in logs.indexed)
            normalizeVm(e.toJson(), ids, timestamp: 1767225600000 + i),
        ],
        'getObject': normalizeVm({
          'request': getObject,
          'result': full.toJson(),
        }, ids),
        'invoke': normalizeVm(invoke, ids),
      });
    },
  );

  test('prints the connect link once', () async {
    final link =
        'https://ui.example.com/#connect='
        '${Uri.encodeComponent(serviceUri.toString())}';
    while (!output.contains('DevPul $link')) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    expect(output.where((l) => l.startsWith('DevPul ')), ['DevPul $link']);
  });

  test('serves the backlog', () async {
    final response = await service.callServiceExtension(
      'ext.devpul.backlog',
      isolateId: isolateId,
    );
    final backlog = (response.json!['events'] as List)
        .cast<Map<String, Object?>>();
    expect(backlog.map((e) => e['kind']), containsAll(events.keys));
  });

  Future<Map<String, dynamic>> call(
    String method, [
    Map<String, String>? args,
  ]) async => (await service.callServiceExtension(
    'ext.devpul.$method',
    isolateId: isolateId,
    args: args,
  )).json!;

  test('answers the handshake', () async {
    final info = await call('info');
    expect(info['protocol'], 1);
    expect(info['actions'], [
      {
        'name': 'echo',
        'params': [
          {'name': 'text', 'type': 'text', 'initial': 'pong'},
        ],
      },
    ]);
    expect(info['plugins'], [
      {
        'id': 'e2e',
        'hash':
            '9aeb8d59b4d483ca6298e9a450fbf37dfd2b4c63990135ab1d040d76314087ec',
      },
    ]);
  });

  test('runs actions with args', () async {
    expect((await call('action', {'name': 'echo'}))['result'], 'pong');
    final result = await call('action', {
      'name': 'echo',
      'args': jsonEncode({'text': 'hi'}),
    });
    expect(result['result'], 'hi');
    expect(call('action', {'name': 'missing'}), throwsA(isA<RPCError>()));
  });

  test('calls handlers, matching contract/call.json', () async {
    final request = {
      'name': 'cart.set',
      'args': jsonEncode({'sku': 'abc-1', 'qty': 2}),
      'writes': 'true',
    };
    final result = await call('call', request);
    expect(result['result'], {'sku': 'abc-1', 'qty': 2});
    late RPCError refused;
    try {
      await call('call', Map.of(request)..remove('writes'));
      fail('ran with writes off');
    } on RPCError catch (e) {
      refused = e;
    }
    expect(call('call', {'name': 'cart.nope'}), throwsA(isA<RPCError>()));
    expectGolden('call.json', {
      'request': request,
      'result': result,
      'refused': {
        'code': refused.code,
        'message': refused.message,
        // The VM echoes the request, with ids that change per run.
        'data': {'details': refused.data!['details']},
      },
    });
  });

  test('serves plugin sources', () async {
    expect(
      (await call('plugin', {'id': 'e2e'}))['source'],
      'export default {}',
    );
  });

  test('sets limits', () async {
    final info = await call('limit', {'kind': 'log', 'perSecond': '0'});
    expect(info['limits'], {'log': 0});
    final cleared = await call('limit', {'kind': 'log'});
    expect(cleared['limits'], isEmpty);
  });
}
