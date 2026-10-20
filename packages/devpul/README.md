# devpul

Core of [DevPul](https://devpul.saradgajurel.com.np): streams HTTP calls, errors, logs, session info and custom events from a running Dart or Flutter debug build to a browser UI over the Dart VM service. No proxy, no server; the UI runs only in your browser. Pure Dart, works on the web.

## Install

```yaml
dependencies:
  devpul: ^1.1.1
```

Then add what your app uses:

- [devpul_dio](https://pub.dev/packages/devpul_dio) for Dio, [devpul_http](https://pub.dev/packages/devpul_http) for package:http.
- [devpul_flutter](https://pub.dev/packages/devpul_flutter) for Flutter errors, `debugPrint` and routes.
- [devpul_test](https://pub.dev/packages/devpul_test) for a session file from each failing test.
- [devpul_cli](https://pub.dev/packages/devpul_cli) for `devpul run`, plugins and coding agents. A global tool, not a dependency: `dart pub global activate devpul_cli`.

## Usage

```dart
import 'package:devpul/devpul.dart';

void main() {
  Devpul.session({'name': 'My app', 'version': '1.0.0'}, tags: {'env': 'dev'});
  Devpul.emit('cart.updated', {'items': 3});
  Devpul.log('Signed in', name: 'auth');
  Devpul.action('Clear cache', (_) => cache.clear());
  try {
    sync();
  } catch (e, s) {
    Devpul.error(e, s, source: 'sync');
  }
}
```

Run the app in debug and open DevPul:

- **DevTools:** the DevPul tab, in the browser or your IDE. Every run prints a link that opens it.
- **Command line:** `devpul run` from devpul_cli, in place of `flutter run`.
- **Hosted site:** paste the app's VM service URL on [devpul.saradgajurel.com.np](https://devpul.saradgajurel.com.np).

The [core API](https://devpul.saradgajurel.com.np/docs/api/) page covers configuration, redaction, limits and handlers; [getting started](https://devpul.saradgajurel.com.np/docs/) the whole setup.

## Plugins

Plugins add tabs to the UI. `devpul add <id>` from devpul_cli copies one into your app:

- [riverpod](https://devpul.saradgajurel.com.np/plugins/riverpod/): Riverpod providers and their recent changes.
- [bloc](https://devpul.saradgajurel.com.np/plugins/bloc/): blocs and cubits, their state and recent events.
- [go_router](https://devpul.saradgajurel.com.np/plugins/go_router/): the route tree, location and matches.
- [app_links](https://devpul.saradgajurel.com.np/plugins/app_links/): incoming links and a test link box.
- [web_socket_channel](https://devpul.saradgajurel.com.np/plugins/web_socket_channel/): WebSocket connections and their messages.
- [files](https://devpul.saradgajurel.com.np/plugins/files/): the app's path_provider directories.
- [secure_storage](https://devpul.saradgajurel.com.np/plugins/secure_storage/): flutter_secure_storage keys.
- [sqflite](https://devpul.saradgajurel.com.np/plugins/sqflite/): sqflite tables, rows and a SQL console.
- [local_notifications](https://devpul.saradgajurel.com.np/plugins/local_notifications/): scheduled and shown notifications.

See [installing plugins](https://devpul.saradgajurel.com.np/docs/plugins/install/) and [writing plugins](https://devpul.saradgajurel.com.np/docs/plugins/).

## Limits

- Debug builds, and profile builds built with `--dart-define=DEVPUL_PROFILE=true`. Release builds never emit.
- Configuration is per isolate.

See [limits](https://devpul.saradgajurel.com.np/docs/limits/).
