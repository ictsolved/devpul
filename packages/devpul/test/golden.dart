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

const _vmKeys = {
  'type',
  'kind',
  'id',
  'name',
  'class',
  'isolate',
  'isolateGroup',
  'isolateGroupId',
  'logRecord',
  'message',
  'loggerName',
  'level',
  'sequenceNumber',
  'time',
  'timestamp',
  'zone',
  'error',
  'stackTrace',
  'valueAsString',
  'valueAsStringIsTruncated',
  'length',
  'request',
  'result',
  'objectId',
  'targetId',
  'offset',
  'count',
  'selector',
  'argumentIds',
};

/// Keeps the VM service fields the UI reads, with ids numbered in order of
/// appearance and times set to [timestamp]: the rest changes per run or SDK.
Object? normalizeVm(
  Object? value,
  Map<String, String> ids, {
  int timestamp = 1767225600000,
}) => switch (value) {
  final Map<String, Object?> map => {
    for (final MapEntry(:key, :value) in map.entries)
      if (_vmKeys.contains(key))
        key: switch (key) {
          'time' || 'timestamp' => timestamp,
          'id' || 'objectId' || 'targetId' || 'isolateGroupId'
              when value is String && !value.endsWith('/null') =>
            _vmId(value, ids),
          'name' when map['type'] == '@IsolateGroup' => 'main.dart',
          _ => normalizeVm(value, ids, timestamp: timestamp),
        },
  },
  final List<Object?> list => [
    for (final v in list) normalizeVm(v, ids, timestamp: timestamp),
  ],
  _ => value,
};

String _vmId(String id, Map<String, String> ids) {
  final prefix = id.substring(0, id.indexOf('/'));
  return ids.putIfAbsent(
    id,
    () =>
        '$prefix/${ids.keys.where((k) => k.startsWith('$prefix/')).length + 1}',
  );
}

const _profileKeys = {
  'type',
  'enabled',
  'timestamp',
  'requests',
  'id',
  'isolateId',
  'method',
  'uri',
  'startTime',
  'endTime',
  'request',
  'response',
  'headers',
  'statusCode',
  'reasonPhrase',
  'isRedirect',
  'redirects',
  'location',
  'error',
  'requestBody',
  'responseBody',
};

/// Keeps the dart:io HTTP profile fields the UI reads. Request ids and times
/// are renumbered in order, [ports] mapped, and the SDK version, OS error
/// number and client port taken out.
Object? normalizeProfile(Object? value, Map<int, int> ports) {
  final times = <int>{};
  void collect(Object? v) {
    if (v is Map) {
      for (final MapEntry(:key, :value) in v.entries) {
        if (const {'timestamp', 'startTime', 'endTime'}.contains(key) &&
            value is int) {
          times.add(value);
        } else {
          collect(value);
        }
      }
    } else if (v is List) {
      v.forEach(collect);
    }
  }

  collect(value);
  final rank = {
    for (final (i, t) in (times.toList()..sort()).indexed)
      t: 1767225600000000 + i * 1000,
  };
  final ids = <String, String>{};
  final vmIds = <String, String>{};
  String text(String s) {
    for (final MapEntry(:key, :value) in ports.entries) {
      s = s.replaceAll(RegExp('\\b$key\\b'), '$value');
    }
    return s
        .replaceAll(RegExp(r'errno = \d+'), 'errno = 111')
        .replaceAll(RegExp(r'port = \d+'), 'port = 50000')
        .replaceAll(RegExp(r'^Dart/[\d.]+'), 'Dart/3');
  }

  Object? walk(Object? v, {bool all = false}) => switch (v) {
    final Map<String, Object?> map => {
      for (final MapEntry(:key, :value) in map.entries)
        if (all || _profileKeys.contains(key))
          key: switch (key) {
            'timestamp' ||
            'startTime' ||
            'endTime' when value is int => rank[value],
            'id' when value is String => ids.putIfAbsent(
              value,
              () => '${ids.length + 1}',
            ),
            'isolateId' when value is String => _vmId(value, vmIds),
            'headers' => walk(value, all: true),
            _ => walk(value),
          },
    },
    final List<Object?> list => [for (final x in list) walk(x, all: all)],
    final String s => text(s),
    _ => v,
  };
  return walk(value, all: true);
}
