# bloc

A Bloc tab for DevPul: every bloc and cubit with its current state and recent events. Each create, event, change and close is also an event (`bloc.*`), and bloc errors show in Errors.

```sh
devpul add bloc
```

```dart
import 'devpul/plugins.dart';

void main() {
  DevpulPlugins.install();
  DevpulBloc.install();
  runApp(const App());
}
```

`DevpulBloc.install()` sets `Bloc.observer` and passes every callback on to the observer that was set before, so call it after setting your own. It does nothing in release and profile builds.

Needs `bloc` 9.1 or later.
