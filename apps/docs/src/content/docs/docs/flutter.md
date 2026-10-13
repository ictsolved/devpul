---
title: Flutter
description: devpul_flutter reports Flutter errors with diagnostics, captures debugPrint, records navigation and overrides platform settings in DevPul.
---

[devpul_flutter](https://pub.dev/packages/devpul_flutter) reports Flutter errors, `debugPrint` output and route changes, and overrides platform settings while the app runs.

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

Reports `FlutterError`s and uncaught platform errors with stack traces. For an error in a build or layout, **Widget** names the widget in your code that caused it and where it was created, as `file:line:column`, with widget creation tracking on (the debug default; `--no-track-widget-creation` turns it off). Flutter's other diagnostics show under **Diagnostics**, and errors Flutter marks as silent (image loading, for example) carry a `silent` badge. Existing `FlutterError.onError` and `PlatformDispatcher.onError` handlers keep running, so crash reporters are unaffected.

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

Each push, pop, replace and remove becomes a `route` event with `action`, `route`, `previous` and `arguments`. A route without a name shows its screen widget, such as `CartPage`, once its first frame is built, so its event goes out after that frame. Without widget creation tracking it shows its type. The route on top when an error happens goes out with it as `route`. The observer also offers a Routes tab with the navigation stack at each step; allow it when DevPul asks. With `go_router`, pass the observer in `GoRouter(observers: [...])`; the [go_router plugin](%REPO_URL%/tree/main/plugins/go_router) adds the route tree and the match stack.

## Overrides

```dart
const app = MaterialApp(builder: DevpulApp.builder);
```

The builder offers an Overrides tab that sets the text scale, brightness, locale, bold text and disabled animations the app sees, as if changed on the device. Brightness picks `theme` or `darkTheme` while `themeMode` is `ThemeMode.system`; a `themeMode` the app sets stays. The locales are the app's `supportedLocales`. Overrides last until the app restarts. `CupertinoApp` and `WidgetsApp` take the same builder, and so do the `.router` forms. With a builder of your own, wrap its result: `builder: (context, child) => DevpulApp.builder(context, yours(context, child))`.

The values in effect at start and after each change go out as an `overrides` event, so the breadcrumbs before an error show the text scale or locale it happened under. Agents read and set them through [`devpul mcp`](/docs/mcp/#plugin-handlers).
