# DevPul

Debug bridge between a running Dart or Flutter app and your browser. The app sends HTTP calls, errors, logs, routes and custom events; the browser shows them live. No proxy, no certificates, no server. Pul means bridge in Nepali.

**Open the UI: [devpul.saradgajurel.com.np](https://devpul.saradgajurel.com.np)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="apps/docs/public/screenshots/session-dark.webp">
  <img alt="DevPul connected to a running app: requests arrive, a POST request opens with its headers and bodies, then an error shows with the requests before it" src="apps/docs/public/screenshots/session-light.webp">
</picture>

Everything runs in your browser. Requests, headers and bodies go from your app to the DevPul tab over `127.0.0.1` and are never sent to a server.

**Docs: [getting started](https://devpul.saradgajurel.com.np/docs/), [IDE setup](https://devpul.saradgajurel.com.np/docs/ide/), [command line](https://devpul.saradgajurel.com.np/docs/cli/), [extending](https://devpul.saradgajurel.com.np/docs/extend/), [plugins](https://devpul.saradgajurel.com.np/docs/plugins/install/), [agents (MCP)](https://devpul.saradgajurel.com.np/docs/mcp/), [tests](https://devpul.saradgajurel.com.np/docs/testing/), [security](https://devpul.saradgajurel.com.np/docs/security/), [limits](https://devpul.saradgajurel.com.np/docs/limits/), [help and FAQ](https://devpul.saradgajurel.com.np/docs/help/).**

## Quick start

1. Add `devpul` and the packages for what your app uses:

   ```yaml
   dependencies:
     devpul: ^1.1.0
     devpul_dio: ^1.1.0 # Dio
     devpul_http: ^1.1.0 # package:http
     devpul_flutter: ^1.1.0 # Flutter errors, debugPrint and routes
   ```

2. Hook them up:

   ```dart
   void main() {
     DevpulFlutter.install();
     Devpul.session({'name': 'My app', 'version': '1.0.0', 'flavor': 'dev'});
     dio.interceptors.add(DevpulDioInterceptor());
     runApp(
       MaterialApp(
         navigatorObservers: [DevpulNavigatorObserver()],
         home: const Home(),
       ),
     );
   ```

3. Run the app in debug and open DevPul, whichever suits you:
   - **DevTools:** the DevPul tab, in the browser or your IDE. Nothing else to install; every run prints a link that opens it.
   - **Command line:** `devpul run` in place of `flutter run` opens DevPul connected to the app. Install it once with `dart pub global activate devpul_cli`.
   - **Hosted site:** paste the app's VM service URL on [devpul.saradgajurel.com.np](https://devpul.saradgajurel.com.np).

The [example app](examples/devpul_example) uses every package and the plugins below.

## Packages

Every app adds `devpul`. The others are optional.

| Package                                                   | What it does                                                                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [devpul](https://pub.dev/packages/devpul)                 | Core: `Devpul.session`, `tags`, `emit`, `log`, `error`, `action`, config, `DevpulHttp` for adapters, and the DevTools tab. Pure Dart, web compatible.  |
| [devpul_dio](https://pub.dev/packages/devpul_dio)         | `DevpulDioInterceptor` for Dio.                                                                                                                        |
| [devpul_http](https://pub.dev/packages/devpul_http)       | `DevpulClient` for package:http.                                                                                                                       |
| [devpul_flutter](https://pub.dev/packages/devpul_flutter) | Flutter errors with diagnostics, `debugPrint` capture, `DevpulNavigatorObserver`, `DevpulApp` overrides.                                               |
| [devpul_test](https://pub.dev/packages/devpul_test)       | `DevpulTest.capture` writes a session file for each failing test, from `dart test` and `flutter test`.                                                 |
| [devpul_cli](https://pub.dev/packages/devpul_cli)         | `devpul run` in place of `flutter run`; `devpul` serves the UI on 127.0.0.1; `devpul add` copies plugins into the app; `devpul mcp` for coding agents. |

`devpul` and `devpul_cli` share a version. The other packages release on their own when they change; pub picks versions that work together.

## Plugins

Plugins add tabs for app state, navigation and storage. `devpul add <id>` copies one into your app; see [installing plugins](https://devpul.saradgajurel.com.np/docs/plugins/install/).

| Plugin                                                                                 | Tab                                                                                                |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| [riverpod](https://devpul.saradgajurel.com.np/plugins/riverpod/)                       | Riverpod providers: each one's current value and recent changes.                                   |
| [bloc](https://devpul.saradgajurel.com.np/plugins/bloc/)                               | Blocs and cubits: current state and recent events.                                                 |
| [go_router](https://devpul.saradgajurel.com.np/plugins/go_router/)                     | The GoRouter route tree, location and matches, recent locations and a box that calls `go`.         |
| [app_links](https://devpul.saradgajurel.com.np/plugins/app_links/)                     | Incoming links: the initial one, each one received, and a box that opens a test link.              |
| [web_socket_channel](https://devpul.saradgajurel.com.np/plugins/web_socket_channel/)   | WebSocket connections, the messages sent and received, and a box that sends text.                  |
| [files](https://devpul.saradgajurel.com.np/plugins/files/)                             | The app's path_provider directories: sizes, preview, download and delete.                          |
| [secure_storage](https://devpul.saradgajurel.com.np/plugins/secure_storage/)           | flutter_secure_storage keys: values hidden until revealed, add, edit and delete.                   |
| [sqflite](https://devpul.saradgajurel.com.np/plugins/sqflite/)                         | sqflite databases: tables and views, paged rows and a SQL console.                                 |
| [local_notifications](https://devpul.saradgajurel.com.np/plugins/local_notifications/) | flutter_local_notifications: scheduled and shown ones, responses, cancel, and a test notification. |

[Writing plugins](https://devpul.saradgajurel.com.np/docs/plugins/) covers your own, from `devpul create` to a listing on the [plugins page](https://devpul.saradgajurel.com.np/plugins/).

## In the browser

- HTTP table with live pending rows, sortable columns, a filter syntax (`status:4xx ms:>500 host:api -word`), tree or raw JSON, copy as curl or fetch, HAR export.
- Errors with stack traces and Flutter diagnostics, grouped by repeat, with the requests made just before.
- Logs, custom events, app actions you trigger from the UI, and plugin tabs.
- Mock rules, breakpoints and replay for HTTP calls.
- Several apps at once, history across reloads, session files to share, keyboard navigation.

`devpul mcp` gives coding agents the same requests, logs, errors and actions over [MCP](https://devpul.saradgajurel.com.np/docs/mcp/). A failing test writes what it recorded to a session file, to open in the UI or hand to an agent.

## How it works

The app posts events with `dart:developer` `postEvent`. They travel on the VM service Extension stream that every debug run already has. The browser connects to the Dart Development Service (DDS) websocket on `127.0.0.1` and reads them. Release builds have no VM service, and DevPul never emits in them. Profile builds leave DevPul out unless built with `--dart-define=DEVPUL_PROFILE=true`.

Works with Flutter on Android, iOS, desktop and web, and with plain Dart programs. Any state management through [observers](https://devpul.saradgajurel.com.np/docs/extend/), any HTTP client through adapters, and dart:io calls with no adapter.

## Limits

- Debug builds, and profile builds that opt in. Never release builds.
- Events cross the VM service as JSON. Very large or very frequent events cost app memory and time; `maxValueLength`, `backlogSize` and `ignoreUrls` keep that bounded.
- Configuration does not cross isolates.

The [limits](https://devpul.saradgajurel.com.np/docs/limits/) page has the rest, and [DevPul, DevTools and talker](https://devpul.saradgajurel.com.np/docs/compare/) when another tool fits better.

## Contributing

[CONTRIBUTING.md](CONTRIBUTING.md) covers the dev setup, checks and releases.

## License

MIT
