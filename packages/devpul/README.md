# devpul

Core of [DevPul](https://devpul.saradgajurel.com.np): streams HTTP calls, errors, logs, session info and custom events from a running Dart or Flutter debug build to a browser UI over the Dart VM service. No proxy, no server; the UI runs only in your browser. Pure Dart, works on the web.

## Install

```yaml
dependencies:
  devpul: ^1.1.0
```

Add [devpul_dio](https://pub.dev/packages/devpul_dio) for Dio, [devpul_http](https://pub.dev/packages/devpul_http) for package:http and [devpul_flutter](https://pub.dev/packages/devpul_flutter) for Flutter errors, `debugPrint` and routes.

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

Run the app with `devpul run` from [devpul_cli](https://pub.dev/packages/devpul_cli), or click the `DevPul` link it prints in any debug run, which opens DevPul in DevTools. The [core API](https://devpul.saradgajurel.com.np/docs/api/) page covers configuration, redaction, limits and handlers; [getting started](https://devpul.saradgajurel.com.np/docs/) the whole setup.

## Limits

- Debug builds, and profile builds built with `--dart-define=DEVPUL_PROFILE=true`. Release builds never emit.
- Configuration is per isolate.

See [limits](https://devpul.saradgajurel.com.np/docs/limits/).
