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

  test('writes a session file for each failing test only', () {
    expect(run.exitCode, 1, reason: '${run.stdout}${run.stderr}');
    final files = out.listSync(recursive: true).whereType<File>();
    final dir = '${out.path}/test/fixtures/shop';
    expect(
      {for (final f in files) f.path},
      {'$dir/cart_adds_an_item.json', '$dir/cart_pays.json'},
    );
    expect(run.stdout, contains('DevPul session file: $dir/cart_pays.json'));
  });

  test('keeps the files of two tests apart', () {
    Set<String> keys(String name) {
      final file = File('${out.path}/test/fixtures/shop/$name.json');
      final session = jsonDecode(file.readAsStringSync()) as Map;
      return {
        for (final e in (session['events'] as List).cast<Map>())
          '${e['session']}|${e['seq']}',
      };
    }

    final pays = keys('cart_pays');
    expect(pays, isNotEmpty);
    expect(keys('cart_adds_an_item').intersection(pays), isEmpty);
  });

  test('holds the session, its events and the failure', () {
    final file = File('${out.path}/test/fixtures/shop/cart_adds_an_item.json');
    final session = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
    final events = (session['events']! as List).cast<Map<String, Object?>>();
    expect(
      [for (final e in events) e['kind']],
      ['app.session', 'test', 'log', 'cart.add', 'error'],
    );
    expect({for (final e in events) e['run']}, {events.first['session']});
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
        'run' => 's1',
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
