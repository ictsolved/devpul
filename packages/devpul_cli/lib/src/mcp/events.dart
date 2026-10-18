import 'dart:convert';

/// Envelope `v` and handshake `protocol` this server reads.
const protocol = 1;

const _prefix = 'devpul.';

/// `data.source` of a `developer.log` record from the Logging stream.
const developerLog = 'developer.log';

/// An event as the UI's store keeps it (`apps/ui/src/core/events.ts`).
final class DevEvent {
  DevEvent({
    required this.kind,
    required this.data,
    required this.tags,
    required this.session,
    required this.seq,
    required this.run,
    required this.isolate,
    required this.isolateId,
    required this.ts,
    required this.size,
  });

  final String kind;
  final Map<String, Object?> data;
  final Map<String, String> tags;
  final String session;
  final int seq;

  /// Hot restart or app launch: the connection and isolate group, or the
  /// session where there is no group (web).
  final String run;
  final String isolate;
  final String? isolateId;
  final int ts;
  final int size;

  /// Arrival order, set by the store. The id tools take.
  int id = 0;

  String get key => '$session|$seq';
}

/// An Extension stream event, or a backlog item in the same shape, as a
/// [DevEvent]. Null when it is not DevPul's or is malformed.
DevEvent? fromVm(Map<String, Object?> raw, String conn) {
  final fullKind = raw['extensionKind'];
  if (fullKind is! String || !fullKind.startsWith(_prefix)) return null;
  final env = raw['extensionData'];
  if (env is! Map<String, Object?>) return null;
  final data = env['data'];
  final (session, seq, ts) = (env['session'], env['seq'], env['ts']);
  if (data is! Map<String, Object?> ||
      session is! String ||
      seq is! num ||
      ts is! num) {
    return null;
  }
  final isolate = _map(raw['isolate']);
  final group =
      _string(_map(raw['isolateGroup'])['id']) ??
      _string(isolate['isolateGroupId']);
  return DevEvent(
    kind: fullKind.substring(_prefix.length),
    data: data,
    tags: _stringMap(env['tags']),
    session: session,
    seq: seq.toInt(),
    run: group != null && group.isNotEmpty ? '$conn|$group' : session,
    isolate: _string(isolate['name']) ?? '',
    isolateId: _string(isolate['id']),
    ts: ts.toInt(),
    size: jsonEncode(env).length,
  );
}

// package:logging's levels; developer.log defaults to 0.
const _levels = [
  (1200, 'shout'),
  (1000, 'severe'),
  (900, 'warning'),
  (800, 'info'),
  (700, 'config'),
  (500, 'fine'),
  (400, 'finer'),
  (1, 'finest'),
];

String levelName(int value) {
  for (final (min, name) in _levels) {
    if (value >= min) return name;
  }
  return 'info';
}

/// A Logging stream event as a `log` event, keyed by its record as the UI
/// does, since DDS replays its buffer to every client. [run] is the run of
/// the record's isolate.
DevEvent? fromLogging(Map<String, Object?> event, {required String run}) {
  final record = event['logRecord'];
  if (record is! Map<String, Object?>) return null;
  final message = _instance(record['message']);
  final error = _instance(record['error']);
  final stack = _instance(record['stackTrace']);
  final objects = <String, Object?>{};
  if (message?['valueAsStringIsTruncated'] == true &&
      message?['id'] is String) {
    objects['message'] = message!['id'];
    if (message['length'] case final num length) objects['length'] = length;
  }
  String? refText(Map<String, Object?>? ref, String field) {
    if (ref == null) return null;
    final value = _string(ref['valueAsString']);
    if ((value == null || ref['valueAsStringIsTruncated'] == true) &&
        ref['id'] is String) {
      objects[field] = ref['id'];
    }
    return value;
  }

  final errorText =
      refText(error, 'error') ?? _string(_map(error?['class'])['name']);
  final stackText = refText(stack, 'stack');
  final data = <String, Object?>{
    'level': levelName((record['level'] as num?)?.toInt() ?? 0),
    'message': _string(message?['valueAsString']) ?? '',
    'source': developerLog,
  };
  final name = _string(_instance(record['loggerName'])?['valueAsString']);
  if (name != null && name.isNotEmpty) data['name'] = name;
  if (errorText != null) data['error'] = errorText;
  if (stackText != null && stackText.isNotEmpty) data['stack'] = stackText;
  if (objects.isNotEmpty) data['objects'] = objects;
  final isolate = _map(event['isolate']);
  final ts =
      (record['time'] as num?)?.toInt() ??
      (event['timestamp'] as num?)?.toInt() ??
      0;
  final hash = _fnv('${record['sequenceNumber']}|${jsonEncode(data)}');
  return DevEvent(
    kind: 'log',
    data: data,
    tags: const {},
    session: 'log:${_string(isolate['id']) ?? run}',
    seq: ts * 1000 + hash % 1000,
    run: run,
    isolate: _string(isolate['name']) ?? '',
    isolateId: _string(isolate['id']),
    ts: ts,
    size: jsonEncode(data).length,
  );
}

/// The events of a session file and its bug report, as the UI's
/// `fromSession` reads them. Throws a [FormatException] on anything else.
({List<DevEvent> events, Map<String, Object?>? report}) fromSession(
  String text,
) {
  final Object? parsed;
  try {
    parsed = jsonDecode(text);
  } on FormatException {
    throw const FormatException('Not a JSON file.');
  }
  if (parsed case {
    'type': 'devpul.session',
    'format': final Object? format,
    'events': final List<Object?> list,
  }) {
    if (format != 1) {
      throw FormatException(
        'Session file format $format is not supported here; '
        'this devpul reads format 1.',
      );
    }
    final events = [
      for (final e in list)
        if (e case {
          'kind': final String kind,
          'run': final String run,
          'session': final String session,
          'seq': final num seq,
          'ts': final num ts,
          'data': final Map<String, Object?> data,
        })
          DevEvent(
            kind: kind,
            data: data,
            tags: _stringMap(e['tags']),
            session: session,
            seq: seq.toInt(),
            run: run,
            isolate: _string(e['isolate']) ?? '',
            isolateId: null,
            ts: ts.toInt(),
            size: jsonEncode(e).length,
          ),
    ];
    return (
      events: events,
      report: switch (parsed['report']) {
        final Map<String, Object?> r
            when r['ts'] is num && r['run'] is String =>
          r,
        _ => null,
      },
    );
  }
  throw const FormatException('Not a DevPul session file.');
}

/// The fields as `key: value` pairs, cut at [max] characters.
String preview(DevEvent e, [int max = 200]) {
  final parts = <String>[];
  for (final MapEntry(:key, :value) in e.data.entries) {
    parts.add('$key: ${value is String ? value : jsonEncode(value)}');
    if (parts.join(', ').length > max) break;
  }
  final text = parts.join(', ');
  return text.length > max ? text.substring(0, max) : text;
}

Map<String, Object?>? _instance(Object? v) =>
    v is Map<String, Object?> && v['kind'] != 'Null' ? v : null;

Map<String, Object?> _map(Object? v) =>
    v is Map<String, Object?> ? v : const {};

String? _string(Object? v) => switch (v) {
  final String s => s,
  final num n => '$n',
  _ => null,
};

Map<String, String> _stringMap(Object? v) => {
  if (v is Map<String, Object?>)
    for (final MapEntry(:key, :value) in v.entries) key: ?_string(value),
};

int _fnv(String text) {
  var h = 0x811c9dc5;
  for (final unit in text.codeUnits) {
    h = ((h ^ unit) * 0x01000193) & 0xffffffff;
  }
  return h;
}
