# devpul_dio

Dio interceptor for [DevPul](https://devpul.saradgajurel.com.np). Shows each request, response and error live in the browser, with headers, bodies, timings and a curl command.

## Install

```yaml
dependencies:
  devpul: ^1.0.0
  devpul_dio: ^1.0.0
```

## Usage

```dart
import 'package:devpul_dio/devpul_dio.dart';
import 'package:dio/dio.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());
```

Add it last so it sees headers set by other interceptors. Ignore rules, redaction, size limits and console output come from `Devpul.configure` in [devpul](https://pub.dev/packages/devpul). See the [Dio page](https://devpul.saradgajurel.com.np/docs/dio/).

Mock rules and breakpoints set in the UI answer, fail, delay or pause its calls, and the UI can replay them: see [Mocks, breakpoints and replay](https://devpul.saradgajurel.com.np/docs/mocking/). Pass the Dio, `DevpulDioInterceptor(dio: dio)`, so replays go out through its adapter.

## Limits

Debug builds, and profile builds built with `DEVPUL_PROFILE`. Streamed request and response bodies show as `<stream>`.
