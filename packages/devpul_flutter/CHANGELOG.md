## 1.1.0

- On devpul 1.1.0.
- `DevpulFlutter.captureDebugPrint` leaves out Flutter's console report of an error that `install` already sent to the Errors tab.

## 1.0.0

- Stable, on devpul 1.0.0.

## 1.0.0-dev.1

- Requires Dart 3.8 and Flutter 3.32.
- `DevpulNavigatorObserver` offers the UI a Routes tab.
- `DevpulApp.builder` offers the UI an Overrides tab: text scale, brightness, locale, bold text and disabled animations, set while the app runs.
- `DevpulFlutter.install` turns console colors off on the iOS simulator unless `DevpulConfig.ansiColors` is set.

## 0.2.0

- Sends Flutter's error diagnostics, such as the widget that caused the error, and flags silent errors.
- `DevpulFlutter.captureDebugPrint` sends `debugPrint` output to the Logs tab.
- `DevpulNavigatorObserver` emits `route` events.

## 0.1.0

- Initial release.
