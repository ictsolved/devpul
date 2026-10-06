# devpul

Core of [DevPul](https://devpul.saradgajurel.com.np): streams HTTP calls, errors, session info and custom events from a running Dart or Flutter debug build to a browser UI over the Dart VM service. No proxy, no server. Pure Dart, works on the web.

## Install

```yaml
dependencies:
  devpul: ^0.1.0
```

Add [devpul_dio](https://pub.dev/packages/devpul_dio) for Dio and [devpul_flutter](https://pub.dev/packages/devpul_flutter) for Flutter error hooks.

## Usage

```dart
import 'package:devpul/devpul.dart';

void main() {
  Devpul.session({'name': 'My app', 'version': '1.0.0'}, tags: {'env': 'dev'});
  Devpul.emit('cart.updated', {'items': 3});
  try {
    sync();
  } catch (e, s) {
    Devpul.error(e, s, source: 'sync');
  }
}
```

Run the app in debug mode and paste the VM service URL it prints into [DevPul](https://devpul.saradgajurel.com.np). For plain Dart use `dart run --enable-vm-service`.

`DevpulConfig` sets console output, size limits, ignore rules and opt-in redaction. `DevpulHttp` is the building block for HTTP client adapters. Both are documented in the [main README](https://github.com/ictsolved/devpul#readme), together with the event schema.

## Limits

- Debug builds only. Release and profile builds never emit.
- Configuration is per isolate.
