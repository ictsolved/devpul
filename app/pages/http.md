---
title: package:http
description: DevpulClient wraps any package:http client and shows its requests, responses and errors in DevPul.
---

# package:http

```yaml
dependencies:
  devpul: ^0.2.0
  devpul_http: ^0.2.0
```

```dart
import 'package:devpul_http/devpul_http.dart';

final client = DevpulClient();
final res = await client.get(Uri.parse('https://example.com/items'));
```

`DevpulClient` wraps another `Client`, `Client()` by default, so it works with `IOClient`, `BrowserClient`, `cupertino_http`, `cronet_http` and anything else that implements `Client`:

```dart
final client = DevpulClient(CronetClient.defaultCronetEngine());
```

Pass it wherever your code or a package takes a `Client`.

What it records:

- method, URL, query params, headers and body; form bodies as fields, `MultipartRequest` as fields and file names
- status, reason, headers, body and duration of the response, and the final URL when the platform reports redirects
- exceptions such as `ClientException` as errors, rethrown unchanged

Response bodies are read in full before your code gets them, which suits API calls. `text/event-stream` responses pass through untouched and show as `<stream>`, as do `StreamedRequest` bodies. Binary bodies show their size.
