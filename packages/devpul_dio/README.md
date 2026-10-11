# devpul_dio

Dio interceptor for [DevPul](https://devpul.saradgajurel.com.np). Shows each request, response and error live in the browser, with headers, bodies, timings and a curl command.

## Install

```yaml
dependencies:
  devpul: ^1.0.0-dev.1
  devpul_dio: ^1.0.0-dev.1
```

## Usage

```dart
import 'package:devpul_dio/devpul_dio.dart';
import 'package:dio/dio.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());
```

Add it last so it sees headers set by other interceptors. Ignore rules, redaction, size limits and console output come from `Devpul.configure` in [devpul](https://pub.dev/packages/devpul). See the [Dio page](https://devpul.saradgajurel.com.np/docs/dio/).

## Limits

Debug builds, and profile builds built with `DEVPUL_PROFILE`. Streamed request and response bodies show as `<stream>`.
