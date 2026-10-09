# riverpod

A Riverpod tab for DevPul: every provider with its current value and recent changes. Each add, update and dispose is also an event (`riverpod.*`), and provider failures show in Errors.

```sh
devpul add riverpod
```

```dart
import 'devpul/plugins.dart';

void main() {
  DevpulPlugins.install();
  runApp(ProviderScope(observers: devpulRiverpodObservers(), child: const App()));
}
```

`devpulRiverpodObservers` returns no observers in release and profile builds. Keep busy providers out with `exclude`, or list the ones to show with `include`; both take providers and families. `filter` decides for the rest:

```dart
devpulRiverpodObservers(exclude: [clockProvider], filter: (p) => p.name != null)
```

Needs `flutter_riverpod` 3.
