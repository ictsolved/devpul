import 'dart:async';

import 'package:vm_service/vm_service.dart';
import 'package:vm_service/vm_service_io.dart';

import '../reload.dart';
import 'events.dart';
import 'store.dart';

const _info = 'ext.devpul.info';
const _backlog = 'ext.devpul.backlog';
const _callTimeout = Duration(seconds: 5);

/// A tool call that cannot run, with a message for the model.
final class ToolException implements Exception {
  ToolException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// The app's VM service, read into [store] as the UI's `Connection` does:
/// handshake, backlog, then the Extension and Logging streams. [target]
/// gives the URL to connect to on each [ensure].
final class AppConnection {
  AppConnection(this.store, this.target);

  final Store store;
  final Future<String?> Function() target;

  String? url;
  VmService? _service;
  Future<void> _ready = Future.value();
  Future<void> _queue = Future.value();
  final _paused = <String>{};
  // Isolates whose handshake a pause cut off; attached again on resume.
  final _reattach = <String>{};
  // The run of each isolate's DevPul events, for Logging records on web,
  // where isolates have no group.
  final _runs = <String, String>{};

  /// Isolates whose devpul speaks another protocol, with the reason.
  final incompatible = <String, String>{};

  bool get connected => _service != null;
  Iterable<String> get paused => _paused;

  /// Connects to the target unless already connected to it, and waits for
  /// the backlog. Throws a [ToolException] when there is no app.
  Future<void> ensure() {
    final next = _queue.then((_) => _ensure());
    _queue = next.catchError((_) {});
    return next;
  }

  Future<void> _ensure() async {
    final next = await target();
    if (next != null && (next != url || _service == null)) {
      await close();
      await _connect(next);
    }
    if (_service == null) {
      throw ToolException(
        next == null
            ? 'No app is connected. Start the app with devpul run, or pass '
                  'its VM service URL to devpul mcp or to the devpul serving '
                  'the UI (devpul <url>).'
            : 'Cannot reach the app at $next. It may have exited.',
      );
    }
    await _ready.timeout(const Duration(seconds: 10), onTimeout: () {});
  }

  Future<void> close() async {
    final service = _service;
    _service = null;
    _paused.clear();
    _reattach.clear();
    _runs.clear();
    incompatible.clear();
    await service?.dispose();
  }

  Future<void> _connect(String vmUrl) async {
    final VmService service;
    try {
      service = await vmServiceConnectUri(
        webSocketUrl(vmUrl),
      ).timeout(_callTimeout);
    } on Object {
      url = vmUrl;
      return;
    }
    url = vmUrl;
    _service = service;
    unawaited(
      service.onDone.then((_) {
        if (_service == service) _service = null;
      }),
    );
    service
      ..onExtensionEvent.listen((e) => _accept(e.json))
      ..onLoggingEvent.listen(_log)
      ..onDebugEvent.listen(_debug)
      ..onIsolateEvent.listen(_isolate);
    _ready = _subscribe(service);
  }

  Future<void> _subscribe(VmService service) async {
    // Names this client in DDS. A plain VM service has no such method.
    unawaited(
      service
          .callMethod('setClientName', args: {'name': 'DevPul MCP'})
          .then((_) {}, onError: (_) {}),
    );
    // Logging replays DDS's last 10k records.
    for (final stream in [
      EventStreams.kExtension,
      EventStreams.kLogging,
      EventStreams.kIsolate,
      EventStreams.kDebug,
    ]) {
      try {
        await service.streamListen(stream);
      } on RPCError {
        // Already subscribed, or not offered by this debug service.
      }
    }
    try {
      final vm = await service.getVM();
      for (final isolate in vm.isolates ?? <IsolateRef>[]) {
        final id = isolate.id;
        if (id == null) continue;
        try {
          final full = await service.getIsolate(id);
          if (full.pauseEvent?.kind case final kind?
              when kind.startsWith('Pause')) {
            _paused.add(id);
          }
        } on Object {
          // Taken as running.
        }
        await _attach(service, isolate);
      }
    } on Object {
      // The live stream still works.
    }
  }

  /// Handshake, then backlog. Apps register `ext.devpul.info` last.
  Future<void> _attach(VmService service, IsolateRef isolate) async {
    final id = isolate.id!;
    if (_paused.contains(id)) {
      _reattach.add(id);
      return;
    }
    final Map<String, Object?> info;
    try {
      info = await _call(service, _info, id);
    } on Object {
      if (_paused.contains(id)) _reattach.add(id);
      // Not a DevPul isolate yet.
      return;
    }
    final version = info['protocol'];
    if (version != protocol) {
      incompatible[id] = version is int && version > protocol
          ? 'The app speaks DevPul protocol $version; update devpul_cli.'
          : 'The app runs an older devpul package; update it.';
      return;
    }
    incompatible.remove(id);
    final Map<String, Object?> backlog;
    try {
      backlog = await _call(service, _backlog, id);
    } on Object {
      if (_paused.contains(id)) _reattach.add(id);
      return;
    }
    var group = isolate.isolateGroupId;
    if (group == null) {
      try {
        group = (await service.getIsolate(id)).isolateGroupId;
      } on Object {
        // Grouped by session then.
      }
    }
    final ref = {'id': id, 'name': isolate.name, 'isolateGroupId': group};
    final events = <DevEvent>[];
    for (final item in (backlog['events'] as List<Object?>?) ?? []) {
      if (item case {
        'kind': final String kind,
        'data': final Map<String, Object?> data,
      }) {
        final e = fromVm({
          'extensionKind': kind,
          'extensionData': data,
          'isolate': ref,
        }, url!);
        if (e != null) events.add(e);
      }
    }
    _remember(events);
    store.add(events);
  }

  void _remember(List<DevEvent> events) {
    for (final e in events) {
      if (e.isolateId case final id?) _runs[id] = e.run;
    }
  }

  void _accept(Map<String, Object?>? raw) {
    if (raw == null || url == null) return;
    final e = fromVm(raw, url!);
    if (e == null) return;
    _remember([e]);
    store.add([e]);
  }

  void _log(Event event) {
    final json = event.json;
    if (json == null || url == null) return;
    final isolate = json['isolate'];
    final id = isolate is Map ? isolate['id'] as String? : null;
    final group = switch (json['isolateGroup']) {
      {'id': final String id} => id,
      _ => isolate is Map ? isolate['isolateGroupId'] as String? : null,
    };
    final run = group != null ? '$url|$group' : _runs[id] ?? '$url|${id ?? ''}';
    final e = fromLogging(json, run: run);
    if (e != null) store.add([e]);
  }

  void _debug(Event event) {
    final (id, kind) = (event.isolate?.id, event.kind);
    if (id == null || kind == null) return;
    if (kind.startsWith('Pause')) {
      _paused.add(id);
    } else if (kind == EventKind.kResume) {
      _paused.remove(id);
      final service = _service;
      if (_reattach.remove(id) && service != null) {
        unawaited(_attach(service, event.isolate!));
      }
    }
  }

  void _isolate(Event event) {
    final isolate = event.isolate;
    final id = isolate?.id;
    final service = _service;
    if (id == null || service == null) return;
    if (event.kind == EventKind.kIsolateExit) {
      _paused.remove(id);
      _reattach.remove(id);
      _runs.remove(id);
      incompatible.remove(id);
    } else if (event.kind == EventKind.kServiceExtensionAdded &&
        event.extensionRPC == _info) {
      _ready = _ready.then((_) => _attach(service, isolate!));
    }
  }

  /// Calls a DevPul service extension on [isolateId].
  Future<Map<String, Object?>> call(
    String method,
    String isolateId, [
    Map<String, String> args = const {},
  ]) {
    final service = _service;
    if (service == null) throw ToolException('The app is not connected.');
    return _call(service, method, isolateId, args);
  }

  Future<Map<String, Object?>> _call(
    VmService service,
    String method,
    String isolateId, [
    Map<String, String> args = const {},
  ]) async {
    // A paused isolate would run it on resume.
    if (_paused.contains(isolateId)) {
      throw ToolException('The app is paused in the debugger.');
    }
    try {
      final response = await service
          .callServiceExtension(method, isolateId: isolateId, args: args)
          .timeout(_callTimeout);
      return response.json ?? const {};
    } on RPCError catch (e) {
      throw ToolException(switch (e.data) {
        {'details': final String details} => details,
        _ => e.message,
      });
    } on TimeoutException {
      throw ToolException(
        'No answer from the app within ${_callTimeout.inSeconds} s.',
      );
    }
  }

  /// The full message, error and stack trace of a `developer.log` record
  /// whose text the VM cut, read from the app.
  Future<Map<String, String>> loadLog(DevEvent e) async {
    final service = _service;
    final objects = e.data['objects'];
    final isolateId = e.isolateId;
    if (service == null || objects is! Map || isolateId == null) return {};
    String text(Object? result) {
      if (result is Sentinel) {
        throw ToolException('The app no longer holds this value.');
      }
      final value = switch (result) {
        final InstanceRef ref => ref.valueAsString,
        _ => null,
      };
      if (value == null) throw ToolException('The app returned no string.');
      return value;
    }

    Future<String> full(String objectId, int? length) async => text(
      await service.getObject(isolateId, objectId, offset: 0, count: length),
    );
    Future<String> toText(String targetId) async {
      final ref = await service.invoke(isolateId, targetId, 'toString', []);
      if (ref is InstanceRef &&
          ref.valueAsStringIsTruncated == true &&
          ref.id != null) {
        return full(ref.id!, ref.length);
      }
      return text(ref);
    }

    final out = <String, String>{};
    try {
      if (objects['message'] case final String id) {
        out['message'] = await full(id, (objects['length'] as num?)?.toInt());
      }
      if (objects['error'] case final String id) {
        out['error'] = await toText(id);
      }
      if (objects['stack'] case final String id) {
        out['stack'] = await toText(id);
      }
    } on RPCError catch (err) {
      throw ToolException('Cannot read the rest of the record: ${err.message}');
    }
    return out;
  }
}
