import 'package:devpul/devpul.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';

import 'inspector.dart';
import 'navigator.dart';

/// Reports Flutter framework errors and uncaught platform errors to DevPul.
abstract final class DevpulFlutter {
  static bool _installed = false;
  static bool _capturing = false;

  /// Keeps the handlers already set, so crash reporters still run.
  static void install() {
    if (!Devpul.enabled || _installed) return;
    _installed = true;

    final flutterPrevious = FlutterError.onError;
    FlutterError.onError = (details) {
      _report(details);
      flutterPrevious?.call(details);
    };

    final dispatcher = PlatformDispatcher.instance;
    final platformPrevious = dispatcher.onError;
    dispatcher.onError = (error, stack) {
      Devpul.error(error, stack, source: 'platform');
      return platformPrevious?.call(error, stack) ?? false;
    };
  }

  /// Sends every `debugPrint` line to the Logs tab as well.
  static void captureDebugPrint() {
    if (!Devpul.enabled || _capturing) return;
    _capturing = true;
    final previous = debugPrint;
    debugPrint = (message, {wrapWidth}) {
      if (message != null) {
        Devpul.log(message, level: 'debug', name: 'debugPrint');
      }
      previous(message, wrapWidth: wrapWidth);
    };
  }

  static void _report(FlutterErrorDetails details) {
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
