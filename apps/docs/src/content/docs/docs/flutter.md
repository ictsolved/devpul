---
title: Flutter
description: devpul_flutter reports Flutter errors with diagnostics, captures debugPrint and records navigation in DevPul.
---

[devpul_flutter](https://pub.dev/packages/devpul_flutter) reports Flutter errors, `debugPrint` output and route changes.

```yaml
dependencies:
  devpul: ^1.0.0-dev.1
  devpul_flutter: ^1.0.0-dev.1
```

## Errors

```dart
void main() {
  DevpulFlutter.install();
  runApp(const MyApp());
}
```

Reports `FlutterError`s and uncaught platform errors with stack traces. Flutter's diagnostics, such as the widget that caused the error, show under **Diagnostics**, and errors Flutter marks as silent (image loading, for example) carry a `silent` badge. Existing `FlutterError.onError` and `PlatformDispatcher.onError` handlers keep running, so crash reporters are unaffected.

Flutter web does not call `PlatformDispatcher.onError` ([flutter#100277](https://github.com/flutter/flutter/issues/100277)). To see uncaught async errors there:

```dart
runZonedGuarded(
  () => runApp(const MyApp()),
  (e, s) => Devpul.error(e, s, source: 'zone'),
);
```

## debugPrint

```dart
DevpulFlutter.captureDebugPrint();
```

Every `debugPrint` line also goes to the Logs tab at level `debug`. Console output is unchanged.

## Routes

```dart
final app = MaterialApp(navigatorObservers: [DevpulNavigatorObserver()]);
```

Each push, pop, replace and remove becomes a `route` event with `action`, `route`, `previous` and `arguments`. Routes without a name show their type. The observer also offers a Routes tab with the navigation stack at each step; allow it when DevPul asks. With `go_router`, pass the observer in `GoRouter(observers: [...])`.
