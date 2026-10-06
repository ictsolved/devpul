import 'package:devpul/devpul.dart';
import 'package:flutter/foundation.dart';

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
      Devpul.error(
        details.exception,
        details.stack,
        source: 'flutter',
        library: details.library,
        context: details.context?.toDescription(),
        information: _information(details),
        silent: details.silent,
      );
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

  // The "relevant error-causing widget" and similar notes.
  static String? _information(FlutterErrorDetails details) {
    final collect = details.informationCollector;
    if (collect == null) return null;
    try {
      final text =
          collect().map((n) => n.toStringDeep().trimRight()).join('\n');
      return text.isEmpty ? null : text;
    } catch (_) {
      return null;
    }
  }
}
