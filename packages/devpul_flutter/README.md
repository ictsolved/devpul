# devpul_flutter

Flutter error hooks for [DevPul](https://devpul.saradgajurel.com.np). Sends `FlutterError` reports and uncaught platform errors, with stack traces, to the browser UI.

## Install

```yaml
dependencies:
  devpul: ^0.1.0
  devpul_flutter: ^0.1.0
```

## Usage

```dart
import 'package:devpul_flutter/devpul_flutter.dart';

void main() {
  DevpulFlutter.install();
  runApp(const MyApp());
}
```

Existing `FlutterError.onError` and `PlatformDispatcher.onError` handlers keep running, so crash reporters are unaffected.

## Limits

- Debug builds only.
- Flutter web does not call `PlatformDispatcher.onError` ([flutter#100277](https://github.com/flutter/flutter/issues/100277)). To see uncaught async errors there, wrap `runApp` in `runZonedGuarded` and call `Devpul.error` from the handler.
