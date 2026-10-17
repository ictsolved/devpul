import 'dart:async';

import 'package:devpul/devpul.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'inspector.dart';
import 'navigator.dart';
import 'simulator.dart' if (dart.library.io) 'simulator_io.dart';

/// Reports Flutter framework errors, uncaught platform errors and app
/// lifecycle changes to DevPul.
abstract final class DevpulFlutter {
  static bool _installed = false;
  static bool _capturing = false;
  static bool _presenting = false;

  /// Keeps the handlers already set, so crash reporters still run. Turns
  /// console colors off on the iOS simulator unless `DevpulConfig.ansiColors`
  /// is set.
  static void install() {
    if (!Devpul.enabled || _installed) return;
    _installed = true;
    // The simulator's log stream reaches the IDE with the escapes as text.
    Devpul.ansiColorsByDefault = !iosSimulator;

    final flutterPrevious = FlutterError.onError;
    FlutterError.onError = (details) {
      _report(details);
      // The console report it prints goes through debugPrint; the Errors tab
      // already has it.
      _presenting = true;
      try {
        flutterPrevious?.call(details);
      } finally {
        _presenting = false;
      }
    };

    final dispatcher = PlatformDispatcher.instance;
    final platformPrevious = dispatcher.onError;
    dispatcher.onError = (error, stack) {
      Devpul.error(error, stack, source: 'platform');
      return platformPrevious?.call(error, stack) ?? false;
    };
    _watchLifecycle();
  }

  // Creating the binding here would break an app or test that creates its
  // own later, so this waits for runApp to create it.
  static void _watchLifecycle() {
    try {
      WidgetsBinding.instance.addObserver(_Lifecycle());
    } catch (_) {
      Timer(const Duration(milliseconds: 100), _watchLifecycle);
    }
  }

  /// Sends `debugPrint` lines to the Logs tab as well, except the console
  /// report of an error [install] sent to the Errors tab.
  static void captureDebugPrint() {
    if (!Devpul.enabled || _capturing) return;
    _capturing = true;
    final previous = debugPrint;
    debugPrint = (message, {wrapWidth}) {
      if (message != null && !_presenting) {
        Devpul.log(message, level: 'debug', name: 'debugPrint');
      }
      previous(message, wrapWidth: wrapWidth);
    };
  }

  /// Wraps flutter_test's `reportTestException` so a failing `testWidgets`
  /// test sends its exception to DevPul, for `DevpulTest.capture` in
  /// `package:devpul_test`:
  /// `reportTestException = DevpulFlutter.recordTestErrors(reportTestException);`
  static void Function(FlutterErrorDetails details, String testDescription)
  recordTestErrors(
    void Function(FlutterErrorDetails details, String testDescription) report,
  ) => (details, testDescription) {
    if (Devpul.enabled) _report(details, test: true);
    report(details, testDescription);
  };

  static void _report(FlutterErrorDetails details, {bool test = false}) {
    var nodes = const <DiagnosticsNode>[];
    Element? creator;
    Element? widget;
    try {
      nodes = details.informationCollector?.call().toList() ?? const [];
      for (final node in nodes) {
        if (node is DiagnosticsDebugCreator && creationTracked) {
          creator = (node.value! as DebugCreator).element;
          widget = localAncestor(creator);
          break;
        }
      }
    } catch (_) {
      // Diagnostics are best effort; the error still goes out.
    }
    // A route pushed in this frame goes out before an error in its build.
    flushRoutes(creator);
    if (test) {
      // The test runner prints the report, so no console line.
      Devpul.emit('error', {
        'source': 'test',
        'type': details.exception.runtimeType.toString(),
        'message': details.exception.toString(),
        'library': details.library,
        'context': details.context?.toDescription(),
        'information': _information(nodes),
        'widget': ?widget?.widget.runtimeType.toString(),
        'route': ?_route(),
        if (widget == null ? null : _location(widget) case final at?)
          'location': {'file': at.file, 'line': at.line, 'column': at.column},
        'stack': details.stack?.toString(),
      });
      return;
    }
    Devpul.error(
      details.exception,
      details.stack,
      source: 'flutter',
      library: details.library,
      context: details.context?.toDescription(),
      information: _information(nodes),
      widget: widget?.widget.runtimeType.toString(),
      location: widget == null ? null : _location(widget),
      silent: details.silent,
    );
  }

  static String? _route() {
    try {
      return Devpul.route?.call();
    } catch (_) {
      return null;
    }
  }

  static ({String file, int line, int column})? _location(Element element) {
    try {
      return creationLocation(element);
    } catch (_) {
      return null;
    }
  }

  // The "relevant error-causing widget" and similar notes, as the console
  // prints them.
  static String? _information(List<DiagnosticsNode> nodes) {
    try {
      Iterable<DiagnosticsNode> shown = nodes;
      for (final transform in FlutterErrorDetails.propertiesTransformers) {
        shown = transform(shown);
      }
      final text = shown.map((n) => n.toStringDeep().trimRight()).join('\n');
      return text.trim().isEmpty ? null : text.trim();
    } catch (_) {
      return null;
    }
  }
}

class _Lifecycle with WidgetsBindingObserver {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) =>
      Devpul.emit('lifecycle', {'state': state.name});
}
