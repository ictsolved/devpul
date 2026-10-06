import 'dart:convert';

import 'config.dart';
import 'console.dart';
import 'devpul.dart';
import 'encode.dart';

/// A multipart body. Adapters convert their client's form type into this.
final class DevpulForm {
  const DevpulForm({this.fields = const [], this.files = const []});

  final List<MapEntry<String, String>> fields;

  /// Field name to file name.
  final List<MapEntry<String, String>> files;

  Map<String, Object?> flatten() {
    final out = <String, Object?>{};
    void put(String key, String value) {
      final existing = out[key];
      out[key] = switch (existing) {
        null => value,
        final List<Object?> list => [...list, value],
        _ => [existing, value],
      };
    }

    for (final e in fields) {
      put(e.key, e.value);
    }
    for (final e in files) {
      put(e.key, e.value);
    }
    return out;
  }
}

/// Shared by HTTP adapters: ids, pairing, ignore rules, redaction, curl and
/// console output.
abstract final class DevpulHttp {
  static int _counter = 0;

  /// Returns null when disabled or ignored; skip the call's later events then.
  static DevpulHttpCall? request({
    required String method,
    required Uri url,
    Map<String, Object?> headers = const {},
    Object? body,
  }) {
    if (!Devpul.enabled) return null;
    try {
      final config = Devpul.config;
      final upper = method.toUpperCase();
      if (config.ignores(upper, url)) return null;
      final id = config.idGenerator?.call() ?? ++_counter;
      final call = DevpulHttpCall._(id, upper, url);
      final h = _headers(config, url, normalizeHeaders(headers));
      final b = _body(config, url, body);
      Devpul.emit('http.request', {
        'id': id,
        'method': upper,
        'url': url.toString(),
        'params': _params(url),
        'headers': h,
        'body': normalizeBody(b),
        'curl': curl(upper, url, h, b),
      });
      call._print('>', '$upper $url', ansiCyan, h, b);
      return call;
    } catch (_) {
      return null;
    }
  }

  static Map<String, Object?> _headers(
    DevpulConfig config,
    Uri url,
    Map<String, Object?> headers,
  ) =>
      config.redactHeaders?.call(url, headers) ?? headers;

  static Object? _body(DevpulConfig config, Uri url, Object? body) {
    final redact = config.redactBody;
    return redact == null ? body : redact(url, body);
  }

  static Map<String, Object?> _params(Uri url) => {
        for (final MapEntry(:key, :value) in url.queryParametersAll.entries)
          key: value.length == 1 ? value.first : value,
      };
}

final class DevpulHttpCall {
  DevpulHttpCall._(this.id, this.method, this.url)
      : _watch = Stopwatch()..start();

  final Object id;
  final String method;
  final Uri url;
  final Stopwatch _watch;

  void response({
    int? status,
    String? statusMessage,
    Map<String, Object?> headers = const {},
    Object? body,
  }) {
    try {
      final config = Devpul.config;
      final ms = _watch.elapsedMilliseconds;
      final h = DevpulHttp._headers(config, url, normalizeHeaders(headers));
      final b = DevpulHttp._body(config, url, body);
      Devpul.emit('http.response', {
        'id': id,
        'method': method,
        'url': url.toString(),
        'status': status,
        'statusMessage': statusMessage,
        'durationMs': ms,
        'headers': h,
        'body': normalizeBody(b),
      });
      final color = switch (status ?? 0) {
        < 300 => ansiGreen,
        < 500 => ansiYellow,
        _ => ansiRed,
      };
      _print('<', '$status $method $url ${ms}ms', color, h, b);
    } catch (_) {
      // Tooling errors must never reach the app.
    }
  }

  void error({
    required String errorType,
    String? message,
    int? status,
    Map<String, Object?> headers = const {},
    Object? body,
  }) {
    try {
      final config = Devpul.config;
      final ms = _watch.elapsedMilliseconds;
      final h = DevpulHttp._headers(config, url, normalizeHeaders(headers));
      final b = DevpulHttp._body(config, url, body);
      Devpul.emit('http.error', {
        'id': id,
        'method': method,
        'url': url.toString(),
        'status': status,
        'errorType': errorType,
        'message': message,
        'durationMs': ms,
        'headers': h,
        'body': normalizeBody(b),
      });
      final code = status == null ? '' : '$status ';
      _print(
        'x',
        '$code$method $url ${ms}ms $errorType${message == null ? '' : ': $message'}',
        ansiRed,
        h,
        b,
      );
    } catch (_) {
      // Tooling errors must never reach the app.
    }
  }

  void _print(
    String arrow,
    String line,
    String color,
    Map<String, Object?> headers,
    Object? body,
  ) {
    final config = Devpul.config;
    if (config.console == ConsoleMode.off) return;
    final c = config.ansiColors ? color : null;
    if (config.console == ConsoleMode.summary) {
      DevpulConsole.write('#$id $arrow', line, color: c);
      return;
    }
    const indent = JsonEncoder.withIndent('  ');
    final detail = [
      line,
      for (final e in headers.entries) '  ${e.key}: ${e.value}',
      if (body != null) indent.convert(toJsonSafe(normalizeBody(body))),
    ].join('\n');
    DevpulConsole.write('#$id $arrow', detail, color: c);
  }
}

/// Single values become strings, repeated ones stay lists.
Map<String, Object?> normalizeHeaders(Map<String, Object?> headers) => {
      for (final MapEntry(:key, :value) in headers.entries)
        key: switch (value) {
          final List<Object?> l when l.length == 1 => l.first?.toString(),
          final List<Object?> l => [for (final v in l) v?.toString()],
          _ => value,
        },
    };

/// Forms become maps, JSON strings are decoded, bytes are summarised.
Object? normalizeBody(Object? body) {
  if (body is DevpulForm) return body.flatten();
  if (body is List<int>) return '<${body.length} bytes>';
  if (body is String) {
    final trimmed = body.trimLeft();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return jsonDecode(body);
      } on FormatException {
        return body;
      }
    }
  }
  return body;
}

/// A single-line curl command. Single quotes, embedded `'` written as `'\''`.
String curl(
  String method,
  Uri url,
  Map<String, Object?> headers,
  Object? body,
) {
  final parts = ['curl'];
  final upper = method.toUpperCase();
  if (upper == 'HEAD') {
    parts.add('--head');
  } else if (upper != 'GET' || (body != null && body is! DevpulForm)) {
    parts.add('-X $upper');
  }
  parts.add(shellQuote(url.toString()));
  for (final MapEntry(:key, :value) in headers.entries) {
    final lower = key.toLowerCase();
    if (lower == 'content-length') continue;
    if (body is DevpulForm && lower == 'content-type') continue;
    final v = value is List ? value.join(', ') : value;
    parts.add('-H ${shellQuote('$key: $v')}');
  }
  switch (body) {
    case null:
      break;
    case DevpulForm(:final fields, :final files):
      for (final f in fields) {
        parts.add('-F ${shellQuote('${f.key}=${f.value}')}');
      }
      for (final f in files) {
        parts.add('-F ${shellQuote('${f.key}=@${f.value}')}');
      }
    case final List<int> bytes:
      parts.add("--data-binary '@<${bytes.length} bytes>'");
    case final String s:
      parts.add('--data-raw ${shellQuote(s)}');
    default:
      parts.add('--data-raw ${shellQuote(jsonEncode(toJsonSafe(body)))}');
  }
  return parts.join(' ');
}

String shellQuote(String value) => "'${value.replaceAll("'", r"'\''")}'";
