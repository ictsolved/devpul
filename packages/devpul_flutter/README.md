# devpul_flutter

Flutter hooks for [DevPul](https://devpul.saradgajurel.com.np). Sends `FlutterError` reports with Flutter's diagnostics and uncaught platform errors to the browser UI, and optionally `debugPrint` output and route changes.

## Install

```yaml
dependencies:
  devpul: ^1.0.0-dev.1
  devpul_flutter: ^1.0.0-dev.1
```

## Usage

```dart
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/material.dart';

void main() {
  DevpulFlutter.install();
  DevpulFlutter.captureDebugPrint(); // optional: debugPrint to the Logs tab
  runApp(
    MaterialApp(
      navigatorObservers: [DevpulNavigatorObserver()], // optional: route events
      home: const Home(),
    ),
  );
}
```

Existing `FlutterError.onError` and `PlatformDispatcher.onError` handlers keep running, so crash reporters are unaffected. See the [Flutter page](https://devpul.saradgajurel.com.np/docs/flutter/).

## Limits

- Debug builds, and profile builds built with `DEVPUL_PROFILE`.
- The widget behind an error and the screen widget of an unnamed route need widget creation tracking, which only debug builds have.
- Flutter web does not call `PlatformDispatcher.onError` ([flutter#100277](https://github.com/flutter/flutter/issues/100277)). To see uncaught async errors there, wrap `runApp` in `runZonedGuarded` and call `Devpul.error` from the handler.
