# devpul_http

[package:http](https://pub.dev/packages/http) client wrapper for [DevPul](https://devpul.saradgajurel.com.np). Shows each request, response and error live in the browser, with headers, bodies, timings and a ready-to-paste curl command.

## Install

```yaml
dependencies:
  devpul: ^0.2.0
  devpul_http: ^0.2.0
```

## Usage

```dart
import 'package:devpul_http/devpul_http.dart';

final client = DevpulClient(); // or DevpulClient(IOClient(...))
final res = await client.get(Uri.parse('https://example.com/items'));
```

It wraps any `http.Client`, so it works with `IOClient`, `BrowserClient`, `cupertino_http` and `cronet_http`. Pass it wherever your code takes a `Client`.

Ignore rules, redaction, size limits and console output come from `Devpul.configure` in [devpul](https://pub.dev/packages/devpul).

## Limits

Debug builds only. Response bodies are read in full before your code gets them, which is fine for API calls; `text/event-stream` responses pass through untouched and show as `<stream>`. `StreamedRequest` bodies show as `<stream>`.
