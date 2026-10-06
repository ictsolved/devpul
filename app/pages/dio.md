---
title: Dio
description: DevpulDioInterceptor shows Dio requests, responses, redirects and errors in DevPul with curl commands.
---

# Dio

```yaml
dependencies:
  devpul: ^0.2.0
  devpul_dio: ^0.2.0
```

```dart
import 'package:devpul_dio/devpul_dio.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());
```

Add it last so it sees headers set by other interceptors; durations are measured from that point. Ids keep counting across Dio instances, so rebuilding Dio per call is fine.

What it records:

- the full resolved URL, query params, headers and body
- `FormData` as a map of fields and file names
- where redirects ended
- status, headers, body and duration of the response
- `DioException`s as errors with their type, such as `connectionTimeout`, `badResponse` or `cancel`, plus any response that came with them

Streamed request and response bodies show as `<stream>`. Ignore rules, redaction, size limits and console output come from [`Devpul.configure`](%ROOT%docs/api/#configuration).
