# devpul_http

[package:http](https://pub.dev/packages/http) client wrapper for [DevPul](https://devpul.saradgajurel.com.np). Shows each request, response and error live in the browser, with headers, bodies, timings and a curl command.

## Install

```yaml
dependencies:
  devpul: ^1.1.0
  devpul_http: ^1.1.0
```

## Usage

```dart
import 'package:devpul_http/devpul_http.dart';

final client = DevpulClient();

Future<String> items() => client.read(Uri.parse('https://example.com/items'));
```

`DevpulClient` wraps any `Client`, `Client()` by default, so it works with `IOClient`, `BrowserClient`, `cupertino_http` and `cronet_http`. Ignore rules, redaction, size limits and console output come from `Devpul.configure` in [devpul](https://pub.dev/packages/devpul). See the [package:http page](https://devpul.saradgajurel.com.np/docs/http/).

Mock rules and breakpoints set in the UI answer, fail, delay or pause its calls, and the UI can replay them: see [Mocks, breakpoints and replay](https://devpul.saradgajurel.com.np/docs/mocking/).

## Limits

Debug builds, and profile builds built with `DEVPUL_PROFILE`. Response bodies are read in full before your code gets them; `text/event-stream` responses pass through untouched and show as `<stream>`, as do `StreamedRequest` bodies.
