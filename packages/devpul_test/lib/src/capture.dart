import 'dart:async';
import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:stack_trace/stack_trace.dart';
import 'package:test_api/hooks.dart';
import 'package:test_api/scaffolding.dart';
// The test's result is not public; flutter_test reads it the same way.
// ignore: implementation_imports
import 'package:test_api/src/backend/invoker.dart';

import 'write_web.dart' if (dart.library.io) 'write_io.dart';

typedef _Event = ({String kind, Map<String, Object?> event});

abstract final class DevpulTest {
  static _Recorder? _recorder;

  /// Records DevPul events during each test declared after this call and,
  /// when a test fails, writes them to a session file in [directory]:
  /// `<directory>/<test file without .dart>/<test name>.json`. Call it at
  /// the top of `main`, or in `testExecutable` in `flutter_test_config.dart`
  /// for every test in a folder. Events from `setUpAll` go to the first test
  /// after it. Files are not written on the web.
  static void capture({String directory = 'build/devpul'}) {
    if (!Devpul.included || _recorder != null) return;
    final recorder = _recorder = _Recorder(directory);
    Devpul.events.listen(recorder.add);
    setUp(recorder.start);
    tearDown(recorder.end);
  }
}

final class _Recorder {
  _Recorder(this.directory);

  final String directory;
  final _events = <_Event>[];
  final _latest = <String, _Event>{};
  int _tests = 0;
  bool _reported = false;

  void add(_Event e) {
    _events.add(e);
    if (e case (kind: 'error', event: {'data': {'source': 'test'}})) {
      _reported = true;
    }
    if (e.kind == 'app.session' || e.kind == 'app.info') _latest[e.kind] = e;
  }

  void start() {
    final live = Invoker.current!.liveTest;
    _tests++;
    _reported = false;
    Devpul.emit('test', {'name': live.test.name, 'suite': ?live.suite.path});
  }

  void end() {
    final live = Invoker.current!.liveTest;
    try {
      if (live.state.result.isPassing || !Devpul.enabled) return;
      // DevpulFlutter.recordTestErrors sent the exception testWidgets hides.
      for (final error in _reported ? const <AsyncError>[] : live.errors) {
        Devpul.emit('error', {
          'source': 'test',
          'type': error.error.runtimeType.toString(),
          'message': error.error.toString(),
          'route': ?_route(),
          'stack': _stack(error.stackTrace),
        });
      }
      final path = writeSession(
        directory,
        live.suite.path ?? '',
        live.test.name,
        _session(),
      );
      _print(
        path == null
            ? 'DevPul: no session file on the web.'
            : 'DevPul session file: $path',
      );
    } catch (e) {
      _print('DevPul: could not write the session file: $e');
    } finally {
      _events.clear();
    }
  }

  String _session() {
    final events = [
      for (final e in _latest.values)
        if (!_events.contains(e)) e,
      ..._events,
    ];
    final session = events.firstOrNull?.event['session'];
    return jsonEncode({
      'type': 'devpul.session',
      'format': 1,
      'exported': DateTime.now().millisecondsSinceEpoch,
      'events': [
        for (final (:kind, :event) in events)
          {
            'kind': kind,
            // One run per test, so tests from several files stay apart.
            'run': '$session|test$_tests',
            'isolate': 'main',
            'session': event['session'],
            'seq': event['seq'],
            'ts': event['ts'],
            'tags': ?event['tags'],
            'data': event['data'],
          },
      ],
    });
  }

  // Folded as the test runner prints it, with URIs the UI can link.
  static String _stack(StackTrace stack) => TestHandle.current
      .formatStackTrace(stack)
      .traces
      .map(
        (trace) => trace.frames
            .map((f) => '${f.uri}${_line(f)}  ${f.member}')
            .join('\n'),
      )
      .join('\n===== asynchronous gap ===========================\n');

  static String _line(Frame f) => switch ((f.line, f.column)) {
    (null, _) => '',
    (final line, null) => ' $line',
    (final line, final column) => ' $line:$column',
  };

  static String? _route() {
    try {
      return Devpul.route?.call();
    } catch (_) {
      return null;
    }
  }

  // ignore: avoid_print
  static void _print(String line) => print(line);
}
