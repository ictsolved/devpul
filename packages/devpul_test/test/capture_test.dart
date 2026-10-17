import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';

void main() {
  late Directory out;
  late ProcessResult run;

  setUpAll(() async {
    out = await Directory.systemTemp.createTemp('devpul_test');
    run = await Process.run(
      Platform.resolvedExecutable,
      ['test', 'test/fixtures/shop.dart'],
      environment: {'DEVPUL_OUT': out.path},
    );
  });

  tearDownAll(() => out.delete(recursive: true));

  test('writes a session file for the failing test only', () {
    expect(run.exitCode, 1, reason: '${run.stdout}${run.stderr}');
    final files = out.listSync(recursive: true).whereType<File>();
    final path = '${out.path}/test/fixtures/shop/cart_adds_an_item.json';
    expect([for (final f in files) f.path], [path]);
    expect(run.stdout, contains('DevPul session file: $path'));
  });

  test('holds the session, its events and the failure', () {
    final file = File('${out.path}/test/fixtures/shop/cart_adds_an_item.json');
    final session = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final events = (session['events']! as List).cast<Map<String, Object?>>();
    expect(
      [for (final e in events) e['kind']],
      ['app.session', 'test', 'log', 'cart.add', 'error'],
    );
    expect({for (final e in events) e['run']}, hasLength(1));
    final error = events.last['data']! as Map<String, Object?>;
    expect(error['source'], 'test');
    expect(error['type'], 'TestFailure');
    expect(error['stack'], contains('shop.dart'));
    expectGolden('test_session.json', normalize(session));
  });
}

/// Compares [value] with `contract/<name>` at the repo root, or writes it
/// when `DEVPUL_UPDATE_GOLDENS` is set (tool/update_goldens.sh).
void expectGolden(String name, Object? value) {
  final file = File('../../contract/$name');
  final text = '${const JsonEncoder.withIndent('  ').convert(value)}\n';
  if (Platform.environment['DEVPUL_UPDATE_GOLDENS'] != null) {
    file.writeAsStringSync(text);
    return;
  }
  expect(
    file.readAsStringSync(),
    text,
    reason: 'contract/$name differs; run tool/update_goldens.sh',
  );
}

Object? normalize(Object? value) => switch (value) {
  final Map<String, Object?> map => {
    for (final MapEntry(:key, :value) in map.entries)
      key: switch (key) {
        'exported' => 0,
        'session' => 's1',
        'run' => 's1|test2',
        'ts' => 1767225600000 + (map['seq']! as int),
        'stack' =>
          '#0      main.<anonymous closure>.<anonymous closure> '
              '(file:///app/test/cart_test.dart:12:7)',
        _ => normalize(value),
      },
  },
  final List<Object?> list => [for (final v in list) normalize(v)],
  _ => value,
};
