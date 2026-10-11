# go_router

A GoRouter tab for DevPul: the app's route tree with full paths, the current location with its match stack, path and query parameters and `extra`, recent locations, and a box that calls `go`. Each location change is also a `go_router.location` event.

```sh
devpul add go_router
```

```dart
import 'devpul/plugins.dart';

final router = GoRouter(
  observers: [DevpulNavigatorObserver()],
  routes: [GoRoute(path: '/', builder: (_, _) => const HomePage())],
);

void main() {
  DevpulPlugins.install();
  DevpulGoRouter.attach(router);
  runApp(MaterialApp.router(routerConfig: router));
}
```

Click a route or a recent location to put it in the box, edit it, then Go. Attaching another router replaces the first. It does nothing unless `Devpul.included`.

`DevpulNavigatorObserver` from `devpul_flutter` is optional: it keeps the Routes tab with each push and pop, which shows the pages go_router builds. Shell routes take their own `observers`.

Needs `go_router` 14 or later.
