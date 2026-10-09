import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

/// Hot reloads a `dart run` app through its VM service when a `.dart` file
/// under [root] is saved. [vmUrl] is set once the app is up and again when
/// it changes.
final class HotReload {
  HotReload(this.root, {required this.log});

  final String root;
  final void Function(String line) log;
  String? vmUrl;

  final _watches = <String, StreamSubscription<FileSystemEvent>>{};
  Timer? _debounce;
  Future<void> _reloading = Future.value();

  // Recursive watches report nothing for nested folders on some Linux
  // systems, so each folder gets its own.
  void start() => _watchTree(root);

  Future<void> stop() async {
    _debounce?.cancel();
    for (final watch in _watches.values) {
      await watch.cancel();
    }
    _watches.clear();
    await _reloading;
  }

  void _watchTree(String dir) {
    if (_watches.containsKey(dir) || _skipped(dir)) return;
    try {
      _watches[dir] = Directory(dir).watch().listen(_changed);
      for (final entry in Directory(dir).listSync()) {
        if (entry is Directory) _watchTree(entry.path);
      }
    } on FileSystemException {
      // Gone, or not readable.
    }
  }

  bool _skipped(String dir) {
    final name = p.basename(dir);
    return dir != root && (name.startsWith('.') || name == 'build');
  }

  void _changed(FileSystemEvent event) {
    if (event.isDirectory) {
      if (event is FileSystemCreateEvent) _watchTree(event.path);
      return;
    }
    final paths = [
      event.path,
      if (event is FileSystemMoveEvent) ?event.destination,
    ];
    if (!paths.any((path) => path.endsWith('.dart'))) return;
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), () {
      _reloading = _reloading.then((_) => reload());
    });
  }

  /// Reloads every isolate and logs the result.
  Future<void> reload() async {
    final url = vmUrl;
    if (url == null) return;
    WebSocket? socket;
    try {
      socket = await WebSocket.connect(webSocketUrl(url));
      final rpc = _Rpc(socket);
      final vm = await rpc.call('getVM');
      final isolates = [
        for (final isolate in vm['isolates']! as List<Object?>)
          (isolate! as Map<String, Object?>)['id']! as String,
      ];
      for (final id in isolates) {
        final report = await rpc.call('reloadSources', {'isolateId': id});
        if (report['success'] != true) {
          final notices = [
            for (final notice in (report['notices'] as List<Object?>?) ?? [])
              if (notice case {'message': final String message}) message,
          ];
          log('Hot reload failed: ${notices.join('\n')}');
          return;
        }
      }
      log('Hot reloaded.');
    } on Exception catch (e) {
      log('Hot reload failed: $e');
    } finally {
      await socket?.close();
    }
  }
}

/// The websocket of the VM service at [url], as `--write-service-info`
/// writes it.
String webSocketUrl(String url) {
  final uri = Uri.parse(url);
  final path = uri.path.endsWith('/ws')
      ? uri.path
      : '${uri.path.endsWith('/') ? uri.path : '${uri.path}/'}ws';
  return uri
      .replace(scheme: uri.scheme == 'https' ? 'wss' : 'ws', path: path)
      .toString();
}

final class _Rpc {
  _Rpc(this._socket) {
    _socket.listen(
      (message) {
        if (message is! String) return;
        final json = jsonDecode(message);
        if (json case {'id': final String id}) {
          final completer = _pending.remove(id);
          if (json case {'result': final Map<String, Object?> result}) {
            completer?.complete(result);
          } else {
            completer?.completeError(
              Exception('${(json as Map<String, Object?>)['error']}'),
            );
          }
        }
      },
      onDone: () {
        for (final completer in _pending.values) {
          completer.completeError(Exception('the VM service closed'));
        }
        _pending.clear();
      },
    );
  }

  final WebSocket _socket;
  final _pending = <String, Completer<Map<String, Object?>>>{};
  var _next = 0;

  Future<Map<String, Object?>> call(
    String method, [
    Map<String, Object?> params = const {},
  ]) {
    final id = '${_next++}';
    final completer = _pending[id] = Completer();
    _socket.add(
      jsonEncode({
        'jsonrpc': '2.0',
        'id': id,
        'method': method,
        'params': params,
      }),
    );
    return completer.future.timeout(const Duration(seconds: 30));
  }
}
