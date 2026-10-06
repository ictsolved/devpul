# DevPul

Debug bridge between a running Dart or Flutter app and your browser. The app sends HTTP calls, errors, session info and custom events; the browser shows them live. No proxy, no certificates, no server. Pul means bridge in Nepali.

**Open the UI: [devpul.saradgajurel.com.np](https://devpul.saradgajurel.com.np)**

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
  <img alt="DevPul showing HTTP requests from a running app, with the detail of a POST request" src="docs/screenshot-light.png">
</picture>

## How it works

The app posts events with `dart:developer` `postEvent`. They travel on the VM service Extension stream that every debug run already has. The browser connects to the Dart Development Service (DDS) websocket on `127.0.0.1` and reads them. Release and profile builds have no VM service, and DevPul never emits in them.

Works with Flutter on Android, iOS, desktop and web, and with plain Dart programs. Any state management, any HTTP client through adapters.

## Quick start

1. Add the packages:

   ```yaml
   dependencies:
     devpul: ^0.1.0
     devpul_dio: ^0.1.0      # Dio
     devpul_flutter: ^0.1.0  # Flutter error hooks
   ```

2. Hook them up:

   ```dart
   import 'package:devpul/devpul.dart';
   import 'package:devpul_dio/devpul_dio.dart';
   import 'package:devpul_flutter/devpul_flutter.dart';

   void main() {
     DevpulFlutter.install();
     Devpul.session({'name': 'My app', 'version': '1.0.0', 'flavor': 'dev'});
     dio.interceptors.add(DevpulDioInterceptor());
     runApp(const MyApp());
   }
   ```

3. Run the app with `flutter run`, open [DevPul](https://devpul.saradgajurel.com.np) and paste the VM service URL the run prints, for example `http://127.0.0.1:41234/AbCdEf12=/`.

The [example app](examples/devpul_example) uses every package.

## Packages

| Package | What it does |
| --- | --- |
| [devpul](packages/devpul) | Pure Dart core: `Devpul.emit`, `session`, `error`, `tags`, config, console output, `DevpulHttp` for adapters. Web compatible. |
| [devpul_dio](packages/devpul_dio) | `DevpulDioInterceptor` for Dio. |
| [devpul_flutter](packages/devpul_flutter) | `DevpulFlutter.install()` reports `FlutterError` and uncaught platform errors. |
| [devpul (npm)](launcher) | `npx devpul` serves the UI on 127.0.0.1. |

## Usage

### Session and tags

```dart
Devpul.session(
  {'name': 'Shop', 'version': '2.3.1', 'env': 'staging', 'baseUrl': 'https://api.example.com'},
  tags: {'env': 'staging'},
);
Devpul.tags['user'] = 'guest';
```

Session fields are free-form; choose which ones the header shows in Settings. Tags are added to every event and become filter chips.

### Custom events and errors

```dart
Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
Devpul.error(error, stack, source: 'sync');
```

Unknown kinds show in the Events tab.

### Configuration

```dart
Devpul.configure(DevpulConfig(
  console: ConsoleMode.verbose,
  ignoreUrls: [RegExp(r'/health$'), 'analytics.example.com'],
  ignoreMethods: {'OPTIONS'},
  redactHeaders: (url, headers) => {
    for (final e in headers.entries)
      e.key: e.key.toLowerCase() == 'authorization' ? '***' : e.value,
  },
));
```

| Option | Default | |
| --- | --- | --- |
| `enabled` | `true` | Release and profile builds never emit either way. |
| `console` | `summary` | `off`, `summary` (one line per call, `#12 < 200 GET https://example.com/items 143ms`) or `verbose` (headers and bodies). |
| `ansiColors` | `true` | Colored console lines. |
| `maxValueLength` | 1 MB | Longer event fields become a truncation marker with a preview. |
| `backlogSize` | 16 MB | Events kept in app memory per isolate and served to the UI on connect. |
| `ignoreUrls`, `ignoreMethods` | none | Calls that are not reported. |
| `redactHeaders`, `redactBody` | none | Redaction is opt-in; by default you see what is sent and received. Applied to events and curl. |
| `idGenerator` | counter | Request ids. |

Configuration is per isolate. Set it again in a long-lived background isolate if you need the same rules there.

### Other HTTP clients

Adapters only need `DevpulHttp`. For `package:http`:

```dart
class DevpulClient extends http.BaseClient {
  DevpulClient(this._inner);
  final http.Client _inner;

  @override
  Future<http.StreamedResponse> send(http.BaseRequest request) async {
    final call = DevpulHttp.request(
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request is http.Request ? request.body : null,
    );
    try {
      final response = await _inner.send(request);
      final bytes = await response.stream.toBytes();
      call?.response(
        status: response.statusCode,
        statusMessage: response.reasonPhrase,
        headers: response.headers,
        body: utf8.decode(bytes, allowMalformed: true),
      );
      return http.StreamedResponse(
        Stream.value(bytes),
        response.statusCode,
        headers: response.headers,
        reasonPhrase: response.reasonPhrase,
        request: request,
      );
    } catch (e) {
      call?.error(errorType: e.runtimeType.toString(), message: '$e');
      rethrow;
    }
  }
}
```

## Connecting

Paste any URL the run prints: the `http://127.0.0.1:PORT/TOKEN=/` line, the DevTools link or a `ws://` URL. Add one URL per app to watch several at once. The token changes on every run, so paste the new one after a restart.

**Fixed URL (optional).** Run with `--dds-port=8181 --disable-service-auth-codes` and use `ws://127.0.0.1:8181/ws`, or press "Fixed port 8181". In VS Code:

```json
"dart.flutterRunAdditionalArgs": ["--dds-port=8181", "--disable-service-auth-codes"]
```

Without the token, any local process or any web page you visit can connect to the debug service while the app runs. Keep it to trusted machines.

| Run | Notes |
| --- | --- |
| `flutter run` | Full support. |
| `flutter attach` | Always uses a token. Events from before the attach come from the app's own backlog. |
| Flutter web | Always uses a token. No isolates. Flutter web does not report uncaught async errors to `PlatformDispatcher.onError` ([flutter#100277](https://github.com/flutter/flutter/issues/100277)); wrap `runApp` in `runZonedGuarded` and call `Devpul.error` to see them. |
| Plain Dart | `dart run --enable-vm-service`. Avoid `--observe`: it pauses isolates on exit, which stalls `Isolate.run` and Dio's background JSON decoding. |

## Running the UI

| Where | How | Notes |
| --- | --- | --- |
| Hosted | [devpul.saradgajurel.com.np](https://devpul.saradgajurel.com.np) | Chrome and Firefox ask once to allow access to apps on this device (local network access). Safari blocks hosted pages from reaching 127.0.0.1. Installable as an app. |
| Local server | `npx devpul` | Any browser, Safari included. |
| File | Download from the hosted page, open from disk | One self-contained HTML file. |

Events are kept in the browser (IndexedDB, 20,000 events and 200 MB by default, oldest dropped first) so a reload keeps history. Turn it off or clear it in Settings.

Shortcuts: `/` filter, up and down or `j` and `k` to move, `Esc` close, `?` help.

## Event schema

Events are posted as `devpul.<kind>`. Every event carries `v` (schema version, 1), `session` (random per isolate), `seq` (per isolate, for de-duplication), `ts` (ms since epoch) and `tags` when set. The VM adds the isolate and isolate group, which the UI uses to group runs. Fields larger than `maxValueLength` are replaced by `{"devpul.truncated": {"size": n, "preview": "..."}}`.

| Kind | Fields |
| --- | --- |
| `http.request` | `id`, `method`, `url`, `params`, `headers`, `body`, `curl` |
| `http.response` | `id`, `method`, `url`, `status`, `statusMessage`, `durationMs`, `headers`, `body` |
| `http.error` | `id`, `method`, `url`, `status`, `errorType`, `message`, `durationMs`, `headers`, `body` |
| `app.session` | free-form fields |
| `error` | `source`, `type`, `message`, `library`, `context`, `stack` |
| anything else | shown in Events |

HTTP events pair on `session` + `id`. Each isolate also answers `ext.devpul.backlog` with its recent events, which the UI fetches on connect because DDS keeps only the last 10,000 Extension events, shared with Flutter's per-frame events.

## UI plugins

A plugin adds a tab for some event kinds. Host an ES module and add its URL in Settings, or call `window.devpul.register(plugin)`:

```js
export default {
  id: 'cart',
  label: 'Cart',
  kinds: ['cart.updated'],
  summarize: (e) => `${e.data.items} items`,
  render(el, e) {
    el.textContent = `Total: ${e.data.total}`;
    return () => {}; // optional cleanup
  },
};
```

The default export can also be a list of plugins or a function that receives `{version, register}`. Plugins run with full access to the page and its data; load only code you trust.

## Limits

- Debug builds only, by design.
- Events cross the VM service as JSON. Very large or very frequent events cost app memory and time; `maxValueLength`, `backlogSize` and `ignoreUrls` keep that bounded.
- Configuration does not cross isolates.
- Browser to app calls are limited to the backlog fetch. Replay and mocking are not supported.

## Development

```sh
flutter pub get
dart analyze --fatal-infos
(cd packages/devpul && dart test && dart test -p chrome)
(cd packages/devpul_dio && dart test)
(cd packages/devpul_flutter && flutter test)

npm install
npm run dev      # UI on http://localhost:5173
npm run check    # oxlint, vitest, tsc, build
```

The site URL and repository link live in `app/site.json`. `npm run deploy` builds the UI and publishes `app/dist` to the `gh-pages` branch.

## License

MIT
