---
title: Dio
description: DevpulDioInterceptor shows Dio requests, responses, redirects and errors in DevPul with curl commands.
---

[devpul_dio](https://pub.dev/packages/devpul_dio) reports Dio calls.

```yaml
dependencies:
  devpul: ^1.0.0
  devpul_dio: ^1.0.0
```

Or run `devpul add dio`, which runs `pub add` for both.

```dart
import 'package:devpul_dio/devpul_dio.dart';
import 'package:dio/dio.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());
```

Add it last so it sees headers set by other interceptors; durations are measured from that point. Ids keep counting across Dio instances, so rebuilding Dio per call is fine.

What it records:

- the full resolved URL, query params, headers and body
- `FormData` as a map of fields and file names
- where redirects ended
- status, headers, body and duration of the response
- `DioException`s as errors with their type, such as `connectionTimeout`, `badResponse` or `cancel`, plus any response that came with them

Streamed request and response bodies show as `<stream>`. Image responses show as previews when read with `ResponseType.bytes`; other response types decode them as text. Ignore rules, redaction, size limits and console output come from [`Devpul.configure`](/docs/api/#configuration).

[Mock rules and breakpoints](/docs/mocking/) apply to its calls. A mocked response or failure passes through every interceptor, as a real one does.

## Replay

A [replayed](/docs/mocking/#replay) call goes out as the interceptor saw it, without the other interceptors. Pass the Dio so it goes through the same `httpClientAdapter` and `transformer`:

```dart
final dio = Dio()..httpClientAdapter = adapter;
dio.interceptors.add(DevpulDioInterceptor(dio: dio));
```

Without it, Dio's default adapter sends replays, which skips an adapter that pins certificates, sets a proxy or uses the platform's HTTP stack.
