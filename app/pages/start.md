---
title: Getting started
description: Add DevPul to a Dart or Flutter app and see its HTTP calls, errors, logs and events live in your browser.
---

# Getting started

DevPul shows what a running Dart or Flutter debug build is doing: HTTP calls with headers and bodies, errors with stack traces, logs, route changes and your own events. The app posts them on the VM service that every debug run already has, and this page reads them over `127.0.0.1`.

> Everything runs in your browser. Requests, headers and bodies go from your app to the DevPul tab and are never sent to a server. History is kept in the browser's own storage, and you can turn that off.

## 1. Add the packages

```yaml
dependencies:
  devpul: ^0.2.0
  devpul_dio: ^0.2.0      # if you use Dio
  devpul_http: ^0.2.0     # if you use package:http
  devpul_flutter: ^0.2.0  # Flutter errors, debugPrint and routes
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

With `package:http`, use `DevpulClient()` wherever you pass a `Client`. See [package:http](%ROOT%docs/http/).

## 3. Run and connect

Run the app in debug mode:

```sh
flutter run
# or, for plain Dart
dart run --enable-vm-service bin/main.dart
```

The run prints a line like `A Dart VM Service on Pixel 7 is available at: http://127.0.0.1:41234/AbCdEf12=/`. Open [DevPul](%ROOT%) and paste that URL into the field, or anywhere on the page. [Connecting](%ROOT%docs/connecting/) covers fixed ports, IDEs, `flutter attach` and the web.

## What you get

- **HTTP**: every call with method, status, duration and size, live pending rows, filters, sortable columns, headers and bodies as tables and JSON trees, and copy as curl or fetch.
- **Errors**: Flutter and uncaught errors with stack traces and Flutter's diagnostics, grouped by repeat, with the requests made just before.
- **Logs**: `Devpul.log` and `debugPrint` output with level and logger filters.
- **Events**: anything you send with `Devpul.emit`.
- **Actions**: buttons that run code in the app, such as clearing a cache or signing out.
- **Plugins**: your own tabs for your own events. See [Plugins](%ROOT%docs/plugins/).

Release and profile builds have no VM service, and DevPul never emits in them, so nothing needs to be removed before shipping.
