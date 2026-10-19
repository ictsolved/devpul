# devpul_flutter

Flutter hooks for [DevPul](https://devpul.saradgajurel.com.np). Sends `FlutterError` reports with Flutter's diagnostics, uncaught platform errors and app lifecycle changes to the browser UI, and optionally `debugPrint` output and route changes. An Overrides tab sets the text scale, brightness, locale, bold text and disabled animations the app sees.

## Install

```yaml
dependencies:
  devpul: ^1.1.0
  devpul_flutter: ^1.1.0
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
      builder: DevpulApp.builder, // optional: Overrides tab
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
