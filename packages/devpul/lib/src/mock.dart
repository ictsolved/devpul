import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'config.dart';
import 'console.dart';
import 'devpul.dart';
import 'encode.dart';

enum DevpulMockMode {
  /// Answers with the rule's status, headers and body without sending.
  respond,

  /// Fails as a network error with the rule's message.
  fail,

  /// Sends the request after the rule's delay.
  delay,

  /// Holds the request, the response or both until the UI lets them go.
  pause,
}

/// What a mock rule set from the UI or an agent says for one call.
final class DevpulMock {
  DevpulMock._({
    required this.mode,
    required this.delay,
    required this.status,
    required this.headers,
    required this.body,
    required this.message,
    required this.pausesRequest,
    required this.pausesResponse,
  });

  final DevpulMockMode mode;

  /// Applies before [DevpulMockMode.respond], [DevpulMockMode.fail] and
  /// [DevpulMockMode.delay].
  final Duration delay;
  final int status;
  final Map<String, String> headers;
  final String body;

  /// The error message for [DevpulMockMode.fail].
  final String message;

  /// For [DevpulMockMode.pause]: whether it holds the request, the response.
  final bool pausesRequest;
  final bool pausesResponse;
}

/// What was changed at a breakpoint. Null fields are unchanged.
final class DevpulHttpEdit {
  const DevpulHttpEdit({
    this.abort = false,
    this.method,
    this.url,
    this.headers,
    this.body,
    this.status,
    this.statusMessage,
  });

  /// Fail the call as a network error.
  final bool abort;
  final String? method;
  final Uri? url;

  /// Every header to send or return.
  final Map<String, String>? headers;

  /// Text, or JSON text when the body passed in was a map or a list.
  final String? body;
  final int? status;
  final String? statusMessage;

  bool get changed =>
      method != null ||
      url != null ||
      headers != null ||
      body != null ||
      status != null ||
      statusMessage != null;
}

/// Test hook: whether a UI or agent listens, and so can resume a pause.
bool Function() debugListening = () => developer.extensionStreamHasListener;

/// How long a breakpoint holds a call while someone listens.
Duration pauseTimeout = const Duration(minutes: 5);

const _maxDelay = Duration(minutes: 10);

final class MockRule {
  MockRule._(this.id, this.on, this.method, this.url, this.mock)
    : _pattern = _glob(url);

  final String id;
  final bool on;

  /// Upper case; null for any.
  final String? method;

  /// The whole URL, `*` for any run of characters.
  final String url;
  final DevpulMock mock;
  final RegExp _pattern;

  bool matches(String method, Uri url) =>
      on &&
      (this.method == null || this.method == method) &&
      _pattern.hasMatch(url.toString());

  static RegExp _glob(String pattern) => RegExp(
    '^${pattern.split('*').map(RegExp.escape).join('.*')}\$',
    dotAll: true,
  );

  static MockRule parse(Object? raw, String fallbackId) {
    if (raw is! Map) throw const FormatException('A rule is a JSON object.');
    T? read<T>(String key) {
      final value = raw[key];
      if (value == null || value is T) return value as T?;
      throw FormatException('Rule field $key has the wrong type.');
    }

    final url = read<String>('url') ?? '';
    if (url.isEmpty) throw const FormatException('A rule needs a url.');
    final modeName = read<String>('mode') ?? DevpulMockMode.respond.name;
    final mode = DevpulMockMode.values.asNameMap()[modeName];
    if (mode == null) {
      throw FormatException(
        'Mode $modeName is not one of respond, fail, delay, pause.',
      );
    }
    final status = read<num>('status')?.toInt() ?? 200;
    if (status < 100 || status > 599) {
      throw FormatException('Status $status is not between 100 and 599.');
    }
    final delayMs = read<num>('delayMs')?.toInt() ?? 0;
    if (delayMs < 0 || delayMs > _maxDelay.inMilliseconds) {
      throw const FormatException('delayMs is between 0 and 600000.');
    }
    final method = read<String>('method')?.trim().toUpperCase();
    final pauseRequest = read<bool>('request') ?? true;
    final pauseResponse = read<bool>('response') ?? false;
    if (mode == DevpulMockMode.pause && !pauseRequest && !pauseResponse) {
      throw const FormatException(
        'A pause rule pauses the request, the '
        'response or both.',
      );
    }
    return MockRule._(
      read<String>('id') ?? fallbackId,
      read<bool>('on') ?? true,
      method == null || method.isEmpty || method == '*' ? null : method,
      url,
      DevpulMock._(
        mode: mode,
        // A pause rule waits on the UI, not a clock.
        delay: mode == DevpulMockMode.pause
            ? Duration.zero
            : Duration(milliseconds: delayMs),
        status: status,
        headers: {
          for (final MapEntry(:key, :value)
              in (read<Map<Object?, Object?>>('headers') ?? const {}).entries)
            '$key': '$value',
        },
        body: read<String>('body') ?? '',
        message: read<String>('message') ?? 'Mocked network failure',
        pausesRequest: pauseRequest,
        pausesResponse: pauseResponse,
      ),
    );
  }

  Map<String, Object?> toJson() => {
    'id': id,
    'on': on,
    'method': method,
    'url': url,
    'mode': mock.mode.name,
    'delayMs': mock.delay.inMilliseconds,
    if (mock.mode == DevpulMockMode.respond) ...{
      'status': mock.status,
      'headers': mock.headers,
      'body': mock.body,
    },
    if (mock.mode == DevpulMockMode.fail) 'message': mock.message,
    if (mock.mode == DevpulMockMode.pause) ...{
      'request': mock.pausesRequest,
      'response': mock.pausesResponse,
    },
  };
}

final class _Pause {
  _Pause(this.event, this.done);

  final Map<String, Object?> event;
  final Completer<Map<Object?, Object?>?> done;
}

/// Rules set through `http.mocks.set` and calls held at breakpoints.
abstract final class Mocks {
  static List<MockRule> _rules = const [];
  static int _ids = 0;
  static final _paused = <String, _Pause>{};

  static List<MockRule> get rules => _rules;

  static DevpulMock? match(String method, Uri url) {
    for (final rule in _rules) {
      if (rule.matches(method, url)) return rule.mock;
    }
    return null;
  }

  /// Adds the handlers with [handle], which takes `Devpul.handle`'s
  /// arguments.
  static void register(
    void Function(
      String name,
      FutureOr<Object?> Function(Map<String, Object?> args) run, {
      bool sensitive,
      String? description,
    })
    handle,
  ) {
    handle(
      'http.mocks',
      (_) => _state(),
      description:
          'The mock rules for HTTP calls made through devpul_http and '
          'devpul_dio, first match wins.',
    );
    handle(
      'http.mocks.set',
      _set,
      sensitive: true,
      description:
          'Replaces the mock rules and returns them. Args: rules, a list of '
          '{url (whole URL, * for any run of characters), method (null for '
          'any), on, mode (respond, fail, delay, pause), delayMs; respond: '
          'status, headers, body (text); fail: message; pause: request, '
          'response (booleans)}. Rules last until the app restarts.',
    );
    handle(
      'http.paused',
      (_) => {
        'paused': [for (final p in _paused.values) p.event],
      },
      description: 'HTTP calls held at a pause rule, request or response.',
    );
    handle(
      'http.resume',
      _resume,
      sensitive: true,
      description:
          'Lets a paused call go on. Args: id, and to change it: method, url, '
          'headers (all of them), body (text) at the request; status, '
          'statusMessage, headers, body at the response; abort: true fails '
          'it as a network error.',
    );
  }

  static Map<String, Object?> _state() => {
    'rules': [for (final r in _rules) r.toJson()],
  };

  static Map<String, Object?> _set(Map<String, Object?> args) {
    final raw = args['rules'];
    if (raw is! List) throw const FormatException('rules is a list.');
    final rules = [for (final r in raw) MockRule.parse(r, 'r${++_ids}')];
    final ids = rules.map((r) => r.id).toSet();
    if (ids.length != rules.length) {
      throw const FormatException('Rule ids repeat.');
    }
    _rules = rules;
    final state = _state();
    emitUnlimited('http.mocks', state);
    return state;
  }

  static Object? _resume(Map<String, Object?> args) {
    final id = args['id']?.toString();
    final pause = _paused.remove(id);
    if (pause == null) {
      throw FormatException('No call $id is paused; it may have timed out.');
    }
    pause.done.complete(args);
    return null;
  }

  static bool get listening {
    try {
      return debugListening();
    } catch (_) {
      return false;
    }
  }

  /// Posts `http.paused` with [event] and waits for `http.resume`, the
  /// timeout or the last listener leaving. Null when nothing was sent back.
  static Future<Map<Object?, Object?>?> hold(
    Object callId,
    Map<String, Object?> event,
  ) async {
    final id = '$callId';
    final pause = _Pause({
      'id': callId,
      ...event,
      'timeoutMs': pauseTimeout.inMilliseconds,
    }, Completer());
    _paused[id] = pause;
    emitUnlimited('http.paused', pause.event);
    if (Devpul.config.console != ConsoleMode.off) {
      DevpulConsole.write(
        '#$id ||',
        'paused at the ${event['stage']}: ${event['method']} ${event['url']}',
        color: consoleColors ? ansiYellow : null,
      );
    }
    // Outside any test zone, as the app's own timers may be.
    final watch = Zone.root.createPeriodicTimer(
      const Duration(seconds: 1),
      (_) => listening ? null : _release(id, 'unwatched'),
    );
    final timeout = Zone.root.createTimer(
      pauseTimeout,
      () => _release(id, 'timeout'),
    );
    final result = await pause.done.future;
    watch.cancel();
    timeout.cancel();
    if (result != null) {
      final how = result['abort'] == true ? 'aborted' : 'resumed';
      emitUnlimited('http.resumed', {'id': callId, 'how': how});
    }
    return result;
  }

  static void _release(String id, String how) {
    final pause = _paused.remove(id);
    if (pause == null) return;
    emitUnlimited('http.resumed', {'id': pause.event['id'], 'how': how});
    pause.done.complete(null);
  }
}

/// Text the UI can edit and send back unchanged in meaning: strings as they
/// are, maps and lists as indented JSON. Null when [body] is neither, or too
/// long to send whole.
String? editableBody(Object? body) {
  final text = switch (body) {
    final String s => s,
    Map<Object?, Object?>() || List<Object?>() => const JsonEncoder.withIndent(
      '  ',
    ).convert(toJsonSafe(body)),
    _ => null,
  };
  if (text == null || text.length > Devpul.config.maxValueLength) return null;
  return text;
}
