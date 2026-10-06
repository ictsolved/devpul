# devpul

Core of [DevPul](https://devpul.saradgajurel.com.np): streams HTTP calls, errors, logs, session info and custom events from a running Dart or Flutter debug build to a browser UI over the Dart VM service. No proxy, no server; the UI runs only in your browser. Pure Dart, works on the web.

## Install

```yaml
dependencies:
  devpul: ^0.2.0
```

Add [devpul_dio](https://pub.dev/packages/devpul_dio) for Dio, [devpul_http](https://pub.dev/packages/devpul_http) for package:http and [devpul_flutter](https://pub.dev/packages/devpul_flutter) for Flutter errors, `debugPrint` and routes.

## Usage

```dart
import 'package:devpul/devpul.dart';

void main() {
  Devpul.session({'name': 'My app', 'version': '1.0.0'}, tags: {'env': 'dev'});
  Devpul.emit('cart.updated', {'items': 3});
  Devpul.log('Signed in', name: 'auth');
  Devpul.action('Clear cache', () => cache.clear());
  try {
    sync();
  } catch (e, s) {
    Devpul.error(e, s, source: 'sync');
  }
}
```

Run the app in debug mode and paste the VM service URL it prints into [DevPul](https://devpul.saradgajurel.com.np). For plain Dart use `dart run --enable-vm-service`.

Actions show in the UI's Actions menu and run in the app when clicked. `DevpulConfig` sets console output, size limits, ignore rules and opt-in redaction. `DevpulHttp` is the building block for HTTP client adapters. See the [core API](https://devpul.saradgajurel.com.np/docs/api/), [adapter guide](https://devpul.saradgajurel.com.np/docs/adapters/) and [event contract](https://devpul.saradgajurel.com.np/docs/events/).

## Limits

- Debug builds only. Release and profile builds never emit.
- Configuration is per isolate.
