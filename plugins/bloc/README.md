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

`DevpulBloc.install()` sets `Bloc.observer` and passes every callback on to the observer that was set before, so call it after setting your own. It does nothing unless `Devpul.included`.

HTTP calls a bloc's handler makes through devpul_http or devpul_dio link to the event it handles: the request's detail shows the event under Started by, and the Bloc tab lists the calls under the event in Recent. `install()` wraps `Bloc.transformer` for this, so set your own before it. Handlers given a `transformer` of their own, such as `restartable()`, are not linked.
