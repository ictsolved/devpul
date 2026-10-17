import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('writes the exception of each failing testWidgets test', () async {
    final out = await Directory.systemTemp.createTemp('devpul_flutter');
    addTearDown(() => out.delete(recursive: true));
    final run = await Process.run(
      'flutter',
      ['test', 'test/fixtures/counter.dart'],
      environment: {'DEVPUL_OUT': out.path},
      runInShell: true,
    );
    expect(run.exitCode, 1, reason: '${run.stdout}${run.stderr}');

    Map<String, Object?> error(String name) {
      final file = File('${out.path}/test/fixtures/counter/$name.json');
      final session = jsonDecode(file.readAsStringSync()) as Map;
      final events = (session['events'] as List).cast<Map<String, Object?>>();
      return events.singleWhere((e) => e['kind'] == 'error')['data']!
          as Map<String, Object?>;
    }

    final failed = error('counts_taps');
    expect(failed['source'], 'test');
    expect(failed['type'], 'TestFailure');
    expect(failed['route'], '/');
    final thrown = error('throws_while_building');
    expect(thrown['type'], 'StateError');
    expect(thrown['widget'], 'Builder');
    expect(thrown['location'], containsPair('line', 26));
  }, timeout: const Timeout(Duration(minutes: 3)));
}
