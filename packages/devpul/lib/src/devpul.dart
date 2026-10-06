import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:math';

import 'config.dart';
import 'console.dart';
import 'encode.dart';

const _off = bool.fromEnvironment('dart.vm.product') ||
    bool.fromEnvironment('dart.vm.profile');

const _reserved = {'v', 'session', 'seq', 'ts', 'tags'};

/// Receives every posted event. Tests only.
void Function(String kind, Map<String, Object?> event)? debugOnPost;

/// Runs an action the way `ext.devpul.action` does. Tests only.
Future<Object?> debugRunAction(String name) => Devpul._runAction(name);

abstract final class Devpul {
  static const schemaVersion = 1;

  static DevpulConfig _config = const DevpulConfig();
  static DevpulConfig get config => _config;
  static void configure(DevpulConfig config) => _config = config;

  /// Merged into every event. The UI builds filters from them.
  static final Map<String, String> tags = {};

  /// Random per isolate, so ids stay unique across hot restarts and isolates.
  static final String sessionId = _randomId();

  static bool get enabled => !_off && _config.enabled;

  static int _seq = 0;
  static Map<String, Object?>? _sessionInfo;
  static bool _listening = false;
  static final _backlog = _Backlog();
  static final _actions = <String, FutureOr<Object?> Function()>{};

  static void emit(String kind, Map<String, Object?> data) {
    if (!enabled) return;
    try {
      _emit(kind, data);
      if (_config.console == ConsoleMode.verbose &&
          kind != 'app.session' &&
          kind != 'error' &&
          !kind.startsWith('http.')) {
        DevpulConsole.write(
          kind,
          const JsonEncoder.withIndent('  ').convert(toJsonSafe(data)),
          color: _config.ansiColors ? ansiGrey : null,
        );
      }
    } catch (_) {
      // Tooling errors must never reach the app.
    }
  }

  static void session(Map<String, Object?> info, {Map<String, String>? tags}) {
    if (!enabled) return;
    if (tags != null) Devpul.tags.addAll(tags);
    _sessionInfo = info;
    emit('app.session', info);
  }

  /// Shows in the Logs tab. [level] is free-form; debug, info, warn and
  /// error get colors.
  static void log(
    String message, {
    String level = 'info',
    String? name,
    Object? error,
    StackTrace? stack,
  }) {
    if (!enabled) return;
    emit('log', {
      'level': level,
      'message': message,
      if (name != null) 'name': name,
      if (error != null) 'error': error.toString(),
      if (stack != null) 'stack': stack.toString(),
    });
  }

  /// Adds a button to the UI's Actions menu that runs [run] in the app. The
  /// result, if any, is shown as text. Registering a name again replaces it.
  static void action(String name, FutureOr<Object?> Function() run) {
    if (!enabled) return;
    _actions[name] = run;
    _backlog.registerAction();
    emit('app.actions', {'actions': _actions.keys.toList()});
  }

  static Future<Object?> _runAction(String name) async {
    final run = _actions[name];
    if (run == null) throw ArgumentError.value(name, 'name', 'unknown action');
    return toJsonSafe(await run());
  }

  static void error(
    Object error,
    StackTrace? stack, {
    String source = 'app',
    String? library,
    String? context,
    String? information,
    bool silent = false,
  }) {
    if (!enabled) return;
    try {
      final message = error.toString();
      if (_config.console != ConsoleMode.off) {
        final where = [source, if (library != null) library].join(' ');
        DevpulConsole.write(
          'error',
          '[$where] ${error.runtimeType}: $message',
          color: _config.ansiColors ? ansiRed : null,
        );
      }
      emit('error', {
        'source': source,
        'type': error.runtimeType.toString(),
        'message': message,
        'library': library,
        'context': context,
        'information': information,
        if (silent) 'silent': true,
        'stack': stack?.toString(),
      });
    } catch (_) {
      // Tooling errors must never reach the app.
    }
  }

  static void _emit(String kind, Map<String, Object?> data) {
    // A listener that shows up late (flutter attach) still learns which app
    // this is.
    final listening = developer.extensionStreamHasListener;
    final info = _sessionInfo;
    if (listening && !_listening && info != null && kind != 'app.session') {
      _listening = true;
      _emit('app.session', info);
    }
    _listening = listening;

    final event = <String, Object?>{
      'v': schemaVersion,
      'session': sessionId,
      'seq': ++_seq,
      'ts': DateTime.now().millisecondsSinceEpoch,
      if (tags.isNotEmpty) 'tags': Map.of(tags),
    };
    var size = 96;
    for (final MapEntry(:key, :value) in data.entries) {
      if (_reserved.contains(key)) continue;
      final (capped, length) =
          capValue(toJsonSafe(value), _config.maxValueLength);
      event[key] = capped;
      size += key.length + length;
    }
    final fullKind = 'devpul.$kind';
    if (kind == 'app.session' || kind == 'app.actions') {
      _backlog.latest[kind] = event;
    }
    _backlog.add(fullKind, event, size, _config.backlogSize);
    developer.postEvent(fullKind, event);
    debugOnPost?.call(kind, event);
  }

  static String _randomId() {
    final random = Random();
    final time = DateTime.now().microsecondsSinceEpoch.toRadixString(36);
    final suffix = random.nextInt(0x3fffffff).toRadixString(36);
    return '$time$suffix';
  }
}

final class _Backlog {
  final _events = Queue<(String, Map<String, Object?>, int)>();
  int _size = 0;
  bool _registered = false;
  bool _actionRegistered = false;

  /// Session and actions survive eviction; the UI drops duplicates.
  final latest = <String, Map<String, Object?>>{};

  void add(String kind, Map<String, Object?> event, int size, int max) {
    _register();
    _events.add((kind, event, size));
    _size += size;
    while (_size > max && _events.isNotEmpty) {
      _size -= _events.removeFirst().$3;
    }
  }

  void _register() {
    if (_registered) return;
    _registered = true;
    try {
      developer.registerExtension('ext.devpul.backlog', (_, __) async {
        final events = [
          for (final MapEntry(:key, :value) in latest.entries)
            {'kind': 'devpul.$key', 'data': value},
          for (final (kind, event, _) in _events) {'kind': kind, 'data': event},
        ];
        return developer.ServiceExtensionResponse.result(
          jsonEncode({'events': events}),
        );
      });
    } catch (_) {
      // Already registered in this isolate.
    }
  }

  void registerAction() {
    if (_actionRegistered) return;
    _actionRegistered = true;
    try {
      developer.registerExtension('ext.devpul.action', (_, params) async {
        try {
          final result = await Devpul._runAction(params['name'] ?? '');
          return developer.ServiceExtensionResponse.result(
            jsonEncode({'result': result}),
          );
        } catch (e) {
          return developer.ServiceExtensionResponse.error(
            developer.ServiceExtensionResponse.extensionError,
            e.toString(),
          );
        }
      });
    } catch (_) {
      // Already registered in this isolate.
    }
  }
}
