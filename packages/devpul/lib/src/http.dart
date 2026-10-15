import 'dart:convert';

import 'config.dart';
import 'console.dart';
import 'devpul.dart';
import 'encode.dart';
import 'mock.dart';

/// A multipart body. Adapters convert their client's form type into this.
final class DevpulForm {
  const DevpulForm({this.fields = const [], this.files = const []});

  final List<MapEntry<String, String>> fields;

  /// Field name to file name.
  final List<MapEntry<String, String>> files;
}

Map<String, Object?> _flatten(DevpulForm form) {
  final out = <String, Object?>{};
  void put(String key, String value) {
    final existing = out[key];
    out[key] = switch (existing) {
      null => value,
      final List<Object?> list => [...list, value],
      _ => [existing, value],
    };
  }

  for (final e in form.fields) {
    put(e.key, e.value);
  }
  for (final e in form.files) {
    put(e.key, e.value);
  }
  return out;
}

/// Shared by HTTP adapters: ids, pairing, ignore rules, redaction, curl and
/// console output.
abstract final class DevpulHttp {
  static int _counter = 0;

  /// Returns null when disabled or ignored; skip the call's later events then.
  /// An adapter passes [mockable] when it acts on [DevpulHttpCall.mock];
  /// other calls never see mock rules.
  static DevpulHttpCall? request({
    required String method,
    required Uri url,
    Map<String, Object?> headers = const {},
    Object? body,
    bool mockable = false,
  }) {
    if (!Devpul.enabled) return null;
    try {
      final config = Devpul.config;
      final upper = method.toUpperCase();
      if (_ignores(config, upper, url)) return null;
      final id = config.idGenerator?.call() ?? ++_counter;
      final call = DevpulHttpCall._(id, upper, url);
      call._headers = normalizeHeaders(headers);
      call._body = body;
      final mock = mockable ? Mocks.match(upper, url) : null;
      call._mock = mock;
      if (mock == null || mock.mode != DevpulMockMode.pause) {
        call._acted = mock?.mode.name;
        call._postRequest();
      } else if (!mock.pausesRequest || !Mocks.listening) {
        call._postRequest();
      }
      return call;
    } catch (_) {
      return null;
    }
  }

  static bool _ignores(DevpulConfig config, String method, Uri url) {
    if (config.ignoreMethods.contains(method)) return true;
    final text = url.toString();
    return config.ignoreUrls.any((p) => p.allMatches(text).isNotEmpty);
  }

  static Map<String, Object?> _headers(
    DevpulConfig config,
    Uri url,
    Map<String, Object?> headers,
  ) => config.redactHeaders?.call(url, headers) ?? headers;

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
  DevpulHttpCall._(this.id, this._method, this._url)
    : _watch = Stopwatch()..start();

  final Object id;
  String _method;
  Uri _url;
  final Stopwatch _watch;
  Map<String, Object?> _headers = const {};
  Object? _body;
  bool _posted = false;
  // The mode of the rule that changed this call, for the events.
  String? _acted;

  String get method => _method;
  Uri get url => _url;

  /// The mock rule that matched, for adapters that passed `mockable`.
  DevpulMock? get mock => _mock;
  DevpulMock? _mock;

  void _postRequest() {
    _posted = true;
    final config = Devpul.config;
    final h = DevpulHttp._headers(config, url, _headers);
    final b = DevpulHttp._body(config, url, _body);
    Devpul.emit('http.request', {
      'id': id,
      'method': method,
      'url': url.toString(),
      'params': DevpulHttp._params(url),
      'headers': h,
      'body': normalizeBody(b, type: _contentType(h)),
      'curl': curl(method, url, h, b),
      'mock': ?_acted,
    });
    _print('>', '$method $url', ansiCyan, h, b);
  }

  /// Holds the request at a pause rule until the UI lets it go, then posts
  /// it as sent. [body] is what the adapter can rebuild from an edit: a
  /// string, or a map or list it sends as JSON; null shows the body passed
  /// to [DevpulHttp.request] read-only.
  Future<DevpulHttpEdit> pauseRequest({Object? body}) async {
    if (_posted) return const DevpulHttpEdit();
    try {
      final config = Devpul.config;
      final shown = DevpulHttp._headers(config, url, _headers);
      final editable = editableBody(body);
      final result = await Mocks.hold(id, {
        'stage': 'request',
        'method': method,
        'url': url.toString(),
        'headers': shown,
        ..._shownBody(editable, body ?? _body, shown),
      });
      final edit = _edit(result, _headers, shown, editable);
      if (result != null) _acted = DevpulMockMode.pause.name;
      if (edit.method != null) _method = edit.method!.toUpperCase();
      if (edit.url != null) _url = edit.url!;
      if (edit.headers != null) _headers = edit.headers!;
      if (edit.body != null) _body = edit.body;
      _postRequest();
      return edit;
    } catch (_) {
      if (!_posted) _postRequest();
      return const DevpulHttpEdit();
    }
  }

  /// Holds the response at a pause rule until the UI lets it go. Call it
  /// before [response] or [error], and pass those what it returns.
  Future<DevpulHttpEdit> pauseResponse({
    int? status,
    String? statusMessage,
    Map<String, Object?> headers = const {},
    Object? body,
  }) async {
    final rule = _mock;
    if (rule == null ||
        rule.mode != DevpulMockMode.pause ||
        !rule.pausesResponse ||
        !Mocks.listening) {
      return const DevpulHttpEdit();
    }
    try {
      final config = Devpul.config;
      final original = normalizeHeaders(headers);
      final shown = DevpulHttp._headers(config, url, original);
      final editable = editableBody(body);
      final result = await Mocks.hold(id, {
        'stage': 'response',
        'method': method,
        'url': url.toString(),
        'status': status,
        'statusMessage': statusMessage,
        'headers': shown,
        ..._shownBody(editable, body, shown),
      });
      if (result != null) _acted = DevpulMockMode.pause.name;
      return _edit(result, original, shown, editable);
    } catch (_) {
      return const DevpulHttpEdit();
    }
  }

  Map<String, Object?> _shownBody(
    String? editable,
    Object? body,
    Map<String, Object?> headers,
  ) {
    final redacted = DevpulHttp._body(Devpul.config, url, body);
    // A redacted body cannot be edited: sending it back would send the mask.
    final canEdit = editable != null && identical(redacted, body);
    return {
      'body': canEdit
          ? editable
          : normalizeBody(redacted, type: _contentType(headers)),
      'editable': canEdit,
      if (canEdit && body is! String) 'json': true,
    };
  }

  static DevpulHttpEdit _edit(
    Map<Object?, Object?>? result,
    Map<String, Object?> original,
    Map<String, Object?> shown,
    String? editable,
  ) {
    if (result == null) return const DevpulHttpEdit();
    if (result['abort'] == true) return const DevpulHttpEdit(abort: true);
    final method = result['method'];
    final url = result['url'];
    final headers = result['headers'];
    final body = result['body'];
    final status = result['status'];
    final statusMessage = result['statusMessage'];
    return DevpulHttpEdit(
      method: method is String && method.isNotEmpty ? method : null,
      url: url is String && url.isNotEmpty ? Uri.parse(url) : null,
      headers: headers is Map
          ? {
              for (final MapEntry(:key, :value) in headers.entries)
                // A redacted value sent back as shown keeps the real one.
                '$key': _headerText(
                  shown[key] == value && original.containsKey(key)
                      ? original[key]
                      : value,
                ),
            }
          : null,
      body: body is String && editable != null && body != editable
          ? body
          : null,
      status: status is num ? status.toInt() : null,
      statusMessage: statusMessage is String ? statusMessage : null,
    );
  }

  static String _headerText(Object? value) =>
      value is List ? value.join(', ') : '${value ?? ''}';

  /// [finalUrl] is where redirects ended, if the client followed any.
  void response({
    int? status,
    String? statusMessage,
    Map<String, Object?> headers = const {},
    Object? body,
    Uri? finalUrl,
  }) {
    try {
      final config = Devpul.config;
      final ms = _watch.elapsedMilliseconds;
      final h = DevpulHttp._headers(config, url, normalizeHeaders(headers));
      final b = DevpulHttp._body(config, url, body);
      // Location headers may be relative.
      final landed = finalUrl == null ? null : url.resolveUri(finalUrl);
      Devpul.emit('http.response', {
        'id': id,
        'method': method,
        'url': url.toString(),
        'status': status,
        'statusMessage': statusMessage,
        if (landed != null && landed != url) 'finalUrl': landed.toString(),
        'durationMs': ms,
        'headers': h,
        'body': normalizeBody(b, type: _contentType(h)),
        'mock': ?_acted,
      });
      final color = switch (status ?? 0) {
        < 300 => ansiGreen,
        < 500 => ansiYellow,
        _ => ansiRed,
      };
      _print('<', '$status $method $url ${ms}ms$_mark', color, h, b);
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
        'body': normalizeBody(b, type: _contentType(h)),
        'mock': ?_acted,
      });
      final code = status == null ? '' : '$status ';
      _print(
        'x',
        '$code$method $url ${ms}ms$_mark $errorType'
            '${message == null ? '' : ': ${message.split('\n').first}'}',
        ansiRed,
        h,
        b,
      );
    } catch (_) {
      // Tooling errors must never reach the app.
    }
  }

  String get _mark => _acted == null ? '' : ' (mock: $_acted)';

  void _print(
    String arrow,
    String line,
    String color,
    Map<String, Object?> headers,
    Object? body,
  ) {
    final config = Devpul.config;
    if (config.console == ConsoleMode.off) return;
    final c = consoleColors ? color : null;
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

String? _contentType(Map<String, Object?> headers) {
  for (final MapEntry(:key, :value) in headers.entries) {
    if (key.toLowerCase() != 'content-type') continue;
    return switch (value) {
      final List<Object?> l => l.firstOrNull?.toString(),
      _ => value?.toString(),
    };
  }
  return null;
}

final _imageType = RegExp(r'^image/[\w.+-]+$');

/// Forms become maps, JSON strings are decoded, bytes of an image [type]
/// become a `data:` URL when it fits the config's `maxValueLength`, other
/// bytes are summarised.
Object? normalizeBody(Object? body, {String? type}) {
  if (body is DevpulForm) return _flatten(body);
  if (body is List<int>) {
    return _dataUrl(body, type) ?? '<${body.length} bytes>';
  }
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

String? _dataUrl(List<int> bytes, String? type) {
  final mime = type?.split(';').first.trim().toLowerCase();
  if (mime == null || !_imageType.hasMatch(mime)) return null;
  // `"data:<mime>;base64,<base64>"` as JSON, measured before encoding.
  final length = 15 + mime.length + (bytes.length + 2) ~/ 3 * 4;
  if (length > Devpul.config.maxValueLength) return null;
  return 'data:$mime;base64,${base64Encode(bytes)}';
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
