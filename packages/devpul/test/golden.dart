import 'dart:convert';
import 'dart:io';

import 'package:test/test.dart';

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

/// Replaces what changes between runs: session ids (with [session]), times,
/// durations and the package version.
Object? normalize(Object? value, [String session = 's1']) => switch (value) {
  final Map<String, Object?> map => {
    for (final MapEntry(:key, :value) in map.entries)
      key: switch (key) {
        'session' when map.containsKey('seq') => session,
        'ts' when map['seq'] is int => 1767225600000 + (map['seq']! as int),
        'durationMs' => 5,
        'version' when map.containsKey('protocol') => '1.0.0',
        _ => normalize(value, session),
      },
  },
  final List<Object?> list => [for (final v in list) normalize(v, session)],
  _ => value,
};
