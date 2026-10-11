---
title: Getting started
description: Add DevPul to a Dart or Flutter app and see its HTTP calls, errors, logs and events live in your browser.
---

DevPul shows what a running Dart or Flutter debug build is doing: HTTP calls with headers and bodies, errors with stack traces, logs, route changes and your own events. The app posts them on the VM service that every debug run already has, and this page reads them over `127.0.0.1`.

> Everything runs in your browser. Requests, headers and bodies go from your app to the DevPul tab and are never sent to a server. History is kept in the browser's own storage, and you can turn that off.

## 1. Add the packages

```yaml
dependencies:
  devpul: ^0.2.0
  devpul_dio: ^0.2.0 # if you use Dio
  devpul_http: ^0.2.0 # if you use package:http
  devpul_flutter: ^0.2.0 # Flutter errors, debugPrint and routes
```

Only `devpul` is required. It is pure Dart and works on every platform, including the web.

## 2. Hook them up

```dart
import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:devpul_flutter/devpul_flutter.dart';

void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0', 'env': 'dev'});
  dio.interceptors.add(DevpulDioInterceptor());
  runApp(MaterialApp(
    navigatorObservers: [DevpulNavigatorObserver()],
    home: const HomePage(),
  ));
}
```

With `package:http`, use `DevpulClient()` wherever you pass a `Client`. See [package:http](/docs/http/).

## 3. Run and connect

Install the command line once, then run the app with it in place of `flutter run`:

```sh
dart pub global activate devpul_cli
devpul run            # takes the flutter run arguments; dart run outside a Flutter project
```

It opens DevPul on `http://127.0.0.1:7171`, connected to the app.

Any other run works too: the app prints a `DevPul ...#connect=...` link at startup that opens DevPul connected to it, and IDEs show DevPul as a DevTools extension. [Connecting](/docs/connecting/) covers IDEs, pasted URLs, `flutter attach` and the web.

## What you get

- **HTTP**: every call with method, status, duration and size, live pending rows, filters, sortable columns, headers and bodies as tables and JSON trees, and copy as curl or fetch.
- **Errors**: Flutter and uncaught errors with stack traces and Flutter's diagnostics, grouped by repeat, with the requests made just before.
- **Logs**: `Devpul.log` and `debugPrint` output with level and logger filters.
- **Events**: anything you send with `Devpul.emit`, such as state changes from Riverpod or Bloc. See [Extending DevPul](/docs/extend/).
- **Actions**: buttons that run code in the app, such as clearing a cache or signing out.
- **Plugins**: your own tabs for your own events. See [Plugins](/docs/plugins/).

Release builds have no VM service, and DevPul never emits in them, so nothing needs to be removed before shipping. Profile builds leave DevPul out unless they [opt in](/docs/api/#profile-builds).
