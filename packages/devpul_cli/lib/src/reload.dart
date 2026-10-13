import 'dart:async';

import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';
import 'package:watcher/watcher.dart';

import 'watch.dart';

/// Hot reloads a `dart run` app through its VM service when a `.dart` file
/// under [root] is saved. [vmUrl] is set once the app is up and again when
/// it changes.
final class HotReload {
  HotReload(this.root, {required this.log});

  final String root;
  final void Function(String line) log;
  String? vmUrl;

  StreamSubscription<WatchEvent>? _watch;
  Timer? _debounce;
  Future<void> _reloading = Future.value();

  /// Completes once saves are watched.
  Future<void> start() {
    final watcher = DirectoryWatcher(root);
    _watch = watcher.events.listen(
      _changed,
      onError: (Object e) => log('Hot reload on save failed: $e'),
    );
    return watcher.ready;
  }

  Future<void> stop() async {
    _debounce?.cancel();
    await _watch?.cancel();
    await _reloading;
  }

  void _changed(WatchEvent event) {
    if (!event.path.endsWith('.dart') || inToolOutput(root, event.path)) {
      return;
    }
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 200), () {
      _reloading = _reloading.then((_) => reload());
    });
  }

  /// Reloads every isolate and logs the result.
  Future<void> reload() async {
    final url = vmUrl;
    if (url == null) return;
    VmService? service;
    try {
      service = await vmServiceConnectUri(webSocketUrl(url));
      final vm = await service.getVM();
      for (final isolate in vm.isolates ?? <IsolateRef>[]) {
        final report = await service
            .reloadSources(isolate.id!)
            .timeout(const Duration(seconds: 30));
        if (report.success != true) {
          final notices = [
            for (final notice
                in (report.json?['notices'] as List<Object?>?) ?? [])
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
      await service?.dispose();
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
