---
title: Getting started
description: Add DevPul to a Dart or Flutter app, run it with devpul run or open the link it prints, and see its HTTP calls, errors, logs and events live in your browser.
---

DevPul shows what a running Dart or Flutter debug build is doing: HTTP calls with headers and bodies, errors with stack traces, logs, route changes and your own events. The app posts them on the VM service that every debug run already has, and the browser reads them over `127.0.0.1`. Pul (पुल) means bridge in Nepali, so DevPul is the bridge between you and your running app.

> Everything runs in your browser. Requests, headers and bodies go from your app to the DevPul tab and are never sent to a server. History is kept in the browser's own storage, and you can turn that off.

<img class="dark:sl-hidden" src="/screenshots/session-light.webp" alt="DevPul connected to a running app: requests arrive, a POST request opens with its headers and bodies, then an error shows with the requests before it" width="1440" height="900" loading="lazy" />
<img class="light:sl-hidden" src="/screenshots/session-dark.webp" alt="DevPul connected to a running app: requests arrive, a POST request opens with its headers and bodies, then an error shows with the requests before it" width="1440" height="900" loading="lazy" />

## 1. Add the packages

```yaml
dependencies:
  devpul: ^1.0.0-dev.1
  devpul_dio: ^1.0.0-dev.1 # if you use Dio
  devpul_http: ^1.0.0-dev.1 # if you use package:http
  devpul_flutter: ^1.0.0-dev.1 # Flutter errors, debugPrint and routes
```

Only [devpul](https://pub.dev/packages/devpul) is required. It is pure Dart and works on every platform, including the web. The others are [devpul_dio](https://pub.dev/packages/devpul_dio), [devpul_http](https://pub.dev/packages/devpul_http) and [devpul_flutter](https://pub.dev/packages/devpul_flutter); the command line is [devpul_cli](https://pub.dev/packages/devpul_cli).

## 2. Hook them up

```dart
import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());

void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0', 'env': 'dev'});
  runApp(
    MaterialApp(
      navigatorObservers: [DevpulNavigatorObserver()],
      home: const HomePage(),
    ),
  );
}
```

With `package:http`, use `DevpulClient()` wherever you pass a `Client`. See [package:http](/docs/http/).

## 3. Run

Install the command line once, then run the app with it in place of `flutter run`:

```sh
dart pub global activate devpul_cli
devpul run -d macos
```

`devpul run` takes the `flutter run` arguments, or runs `dart run` outside a Flutter project. It opens DevPul on `http://127.0.0.1:7171`, connected to the app. See [Command line](/docs/cli/).

## Or open the printed link

Every debug run prints a link once the tool is attached, from the terminal, VS Code or Android Studio:

```text
DevPul http://127.0.0.1:41234/AbCdEf12=/devtools/devpul_ext?uri=ws%3A%2F%2F127.0.0.1%3A41234%2FAbCdEf12%3D%2Fws
```

Click it and DevTools opens on the DevPul tab, connected to the app; enable DevPul once per project when DevTools asks. In an IDE, DevTools is also a click away; see [IDE setup](/docs/ide/). [Connecting](/docs/connecting/) covers pasted URLs, `flutter attach`, the web and plain Dart.

## What you get

- **HTTP**: every call through an adapter, or through dart:io with no code change, with method, status, duration and size, live pending rows, filters, sortable columns, headers as tables, bodies as tree or raw JSON, and copy as curl or fetch.
- **Errors**: Flutter and uncaught errors with stack traces that open in the editor and Flutter's diagnostics, grouped by repeat, with the routes, logs and requests just before.
- **Logs**: `Devpul.log`, `developer.log` and `debugPrint` output with level and logger filters.
- **Events**: anything you send with `Devpul.emit`, such as state changes from Riverpod or Bloc. See [Extending DevPul](/docs/extend/).
- **Actions**: buttons that run code in the app, such as clearing a cache or signing out. See [Actions](/docs/actions/).
- **Plugins**: tabs for your own events and for parts of the app, such as its files. See [Installing plugins](/docs/plugins/install/).
- **Agents**: the same requests, logs, errors and events, and the actions, for Claude Code, Copilot and other coding agents over MCP. See [Agents (MCP)](/docs/mcp/).

Release builds have no VM service, and DevPul never emits in them, so nothing needs to be removed before shipping. Profile builds leave DevPul out unless they [opt in](/docs/api/#profile-builds). [Limits](/docs/limits/) lists what DevPul does not do.
