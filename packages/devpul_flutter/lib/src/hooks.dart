import 'package:devpul/devpul.dart';
import 'package:flutter/foundation.dart';

/// Reports Flutter framework errors and uncaught platform errors to DevPul.
abstract final class DevpulFlutter {
  static bool _installed = false;

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
}
