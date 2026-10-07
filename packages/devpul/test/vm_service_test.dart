@TestOn('vm')
library;

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';
import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

void main() {
  late Process app;
  late VmService service;
  late String isolateId;
  final events = <String, Map<String, Object?>>{};

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

    while (!info.existsSync() || info.lengthSync() == 0) {
      await Future<void>.delayed(const Duration(milliseconds: 50));
    }
    final uri = Uri.parse(
      (jsonDecode(info.readAsStringSync()) as Map)['uri'] as String,
    );
    service = await vmServiceConnectUri(
      uri.replace(scheme: 'ws', path: '${uri.path}ws').toString(),
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
      {'id': 'e2e'},
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
