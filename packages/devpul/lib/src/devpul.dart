import 'dart:async';
import 'dart:collection';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:math';

import 'action.dart';
import 'config.dart';
import 'console.dart';
import 'encode.dart';
import 'limits.dart';
import 'sha256.dart';
import 'version.dart';

const _off =
    bool.fromEnvironment('dart.vm.product') ||
    bool.fromEnvironment('dart.vm.profile');
const _web = bool.fromEnvironment('dart.library.js_interop');

/// Envelope `v` and handshake `protocol`.
const protocolVersion = 1;

/// Receives every posted event. Tests only.
void Function(String kind, Map<String, Object?> event)? debugOnPost;

/// Runs an action the way `ext.devpul.action` does. Tests only.
Future<Object?> debugRunAction(String name, [Map<String, Object?>? args]) =>
    Devpul._runAction(name, args);

/// What `ext.devpul.info` returns. Tests only.
Map<String, Object?> debugInfo() => Devpul._info();

/// What `ext.devpul.plugin` returns. Tests only.
String debugPluginSource(String id) => Devpul._pluginSource(id);

typedef _Action = ({
  List<DevpulParam> params,
  FutureOr<Object?> Function(Map<String, Object?> args) run,
});

final class _Plugin {
  _Plugin(this.source, this.version);

  final String Function() source;
  final String? version;

  late final String hash = sha256Hex(source());
}

abstract final class Devpul {
  static DevpulConfig _config = const DevpulConfig();
  static DevpulConfig get config => _config;
  static void configure(DevpulConfig config) => _config = config;

  /// Merged into every event. The UI builds filters from them.
  static final Map<String, String> tags = {};

  static bool get enabled => !_off && _config.enabled;

  // Random per isolate, so ids stay unique across hot restarts and isolates.
  static final String _session = _randomId();
  static int _seq = 0;
  static Map<String, Object?>? _sessionInfo;
  static bool _listening = false;
  static bool _infoQueued = false;
  static String? _link;
  static final _backlog = _Backlog();
  static final _limits = Limits();
  static final _actions = <String, _Action>{};
  static final _plugins = <String, _Plugin>{};

  static void emit(String kind, Map<String, Object?> data) {
    if (!enabled) return;
    try {
      final now = DateTime.now().millisecondsSinceEpoch;
      if (!kind.startsWith('app.') && !_limits.allow(kind, now)) return;
      _emit(kind, data, now);
      if (_config.console == ConsoleMode.verbose &&
          !kind.startsWith('app.') &&
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
      'name': ?name,
      if (error != null) 'error': error.toString(),
      if (stack != null) 'stack': stack.toString(),
    });
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
        final where = [source, ?library].join(' ');
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

  /// Adds an item to the UI's Actions menu that runs [run] in the app.
  /// [params] become a form; [run] gets their values by name. The result,
  /// if any, is shown as text. Registering a name again replaces it.
  static void action(
    String name,
    FutureOr<Object?> Function(Map<String, Object?> args) run, {
    List<DevpulParam> params = const [],
  }) {
    if (!enabled) return;
    _actions[name] = (params: params, run: run);
    _infoChanged();
  }

  /// Offers a browser plugin to the UI, which runs it after the user
  /// approves it. [id] is the Dart package that ships it. [source] is an ES
  /// module; its SHA-256 goes in the handshake so the UI can load an approved
  /// copy it keeps without asking for the source.
  static void plugin(String id, String Function() source, {String? version}) {
    if (!enabled) return;
    _plugins[id] = _Plugin(source, version);
    _infoChanged();
  }

  /// Caps events of [kind] and its dotted children, such as `http` for
  /// `http.request`, at [perSecond]; the rest are dropped. 0 mutes, null
  /// removes the cap. The UI can change these too.
  static void limit(String kind, int? perSecond) {
    if (!enabled) return;
    _limits.set(kind, perSecond);
    _infoChanged();
  }

  static Future<Object?> _runAction(
    String name,
    Map<String, Object?>? args,
  ) async {
    final action = _actions[name];
    if (action == null) {
      throw ArgumentError.value(name, 'name', 'unknown action');
    }
    final values = {
      for (final p in action.params) p.name: p.read(args?[p.name]),
    };
    return toJsonSafe(await action.run(values));
  }

  static String _pluginSource(String id) {
    final plugin = _plugins[id];
    if (plugin == null) throw ArgumentError.value(id, 'id', 'unknown plugin');
    return plugin.source();
  }

  static Map<String, Object?> _info() => {
    'protocol': protocolVersion,
    'version': packageVersion,
    'capabilities': const <String>[],
    'actions': [
      for (final MapEntry(:key, :value) in _actions.entries)
        {
          'name': key,
          'params': [for (final p in value.params) p.toJson()],
        },
    ],
    'plugins': [
      for (final MapEntry(:key, :value) in _plugins.entries)
        {'id': key, 'version': ?value.version, 'hash': value.hash},
    ],
    'limits': _limits.all,
    'dropped': Map.of(_limits.dropped),
  };

  // Several registrations in a row post one event.
  static void _infoChanged() {
    if (_infoQueued) return;
    _infoQueued = true;
    scheduleMicrotask(() {
      _infoQueued = false;
      emit('app.info', _info());
    });
  }

  // A later `flutter attach` moves serverUri to its DDS and subscribes to
  // the Extension stream, so the link is checked again then.
  static Future<void> _printLink() async {
    final base = _config.uiUrl;
    if (_web || base == null || _config.console == ConsoleMode.off) return;
    try {
      final uri = (await developer.Service.getInfo()).serverUri;
      if (uri == null) return;
      final link = '$base#connect=${Uri.encodeComponent(uri.toString())}';
      if (link == _link) return;
      _link = link;
      DevpulConsole.write('DevPul', link);
    } catch (_) {
      // No VM service.
    }
  }

  static void _emit(String kind, Map<String, Object?> data, int now) {
    if (_backlog.register()) unawaited(_printLink());
    // A listener that shows up late (flutter attach) still learns which app
    // this is.
    final listening = developer.extensionStreamHasListener;
    if (listening && !_listening) unawaited(_printLink());
    final info = _sessionInfo;
    if (listening && !_listening && info != null && kind != 'app.session') {
      _listening = true;
      _emit('app.session', info, now);
    }
    _listening = listening;

    final payload = <String, Object?>{};
    var size = 96;
    for (final MapEntry(:key, :value) in data.entries) {
      final (capped, length) = capValue(value, _config.maxValueLength);
      payload[key] = capped;
      size += key.length + length + 4;
    }
    for (final MapEntry(:key, :value) in tags.entries) {
      size += key.length + value.length + 6;
    }
    final event = <String, Object?>{
      'v': protocolVersion,
      'session': _session,
      'seq': ++_seq,
      'ts': now,
      if (tags.isNotEmpty) 'tags': Map.of(tags),
      'data': payload,
    };
    final fullKind = 'devpul.$kind';
    if (kind == 'app.session' || kind == 'app.info') {
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

  /// Session and info survive eviction; the UI drops duplicates.
  final latest = <String, Map<String, Object?>>{};

  void add(String kind, Map<String, Object?> event, int size, int max) {
    _events.add((kind, event, size));
    _size += size;
    while (_size > max && _events.isNotEmpty) {
      _size -= _events.removeFirst().$3;
    }
  }

  List<Map<String, Object?>> get events => [
    for (final MapEntry(:key, :value) in latest.entries)
      {'kind': 'devpul.$key', 'data': value},
    for (final (kind, event, _) in _events) {'kind': kind, 'data': event},
  ];

  /// True on the first call. The UI waits for ext.devpul.info, so it goes
  /// last.
  bool register() {
    if (_registered) return false;
    _registered = true;
    _extension('backlog', (_) => {'events': events});
    _extension('action', (params) async {
      final args = params['args'];
      return {
        'result': await Devpul._runAction(
          params['name'] ?? '',
          args == null ? null : (jsonDecode(args) as Map).cast(),
        ),
      };
    });
    _extension(
      'plugin',
      (params) => {'source': Devpul._pluginSource(params['id'] ?? '')},
    );
    _extension('limit', (params) {
      final kind = params['kind'] ?? '';
      if (kind.isEmpty) throw ArgumentError.value(kind, 'kind');
      final perSecond = params['perSecond'];
      Devpul.limit(
        kind,
        perSecond == null || perSecond.isEmpty ? null : int.parse(perSecond),
      );
      return Devpul._info();
    });
    _extension('info', (_) => Devpul._info());
    return true;
  }

  static void _extension(
    String name,
    FutureOr<Object?> Function(Map<String, String> params) handle,
  ) {
    try {
      developer.registerExtension('ext.devpul.$name', (_, params) async {
        try {
          return developer.ServiceExtensionResponse.result(
            jsonEncode(await handle(params)),
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
