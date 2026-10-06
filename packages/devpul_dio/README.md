# devpul_dio

Dio interceptor for [DevPul](https://devpul.saradgajurel.com.np). Shows each request, response and error live in the browser, with headers, bodies, timings and a ready-to-paste curl command.

## Install

```yaml
dependencies:
  devpul: ^0.2.0
  devpul_dio: ^0.2.0
```

## Usage

```dart
import 'package:devpul_dio/devpul_dio.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());
```

Add it last so it sees headers set by other interceptors. Ids keep counting across Dio instances, so rebuilding Dio per call is fine. `FormData` shows as a map of fields and file names, JSON strings show structured, the full resolved URL is used and redirects show where they ended.

Ignore rules, redaction, size limits and console output come from `Devpul.configure` in [devpul](https://pub.dev/packages/devpul).

## Limits

Debug builds only. Streamed request and response bodies show as `<stream>`.
