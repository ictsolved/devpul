## 1.1.1

- Requires dio 5.3.1, the first with `FormData.clone`, which replay uses.

## 1.1.0

- Acts on mock rules: answers, fails, delays or pauses calls, as the UI or an agent sets them. Mocked responses and failures pass through every interceptor, and a status that fails `validateStatus` throws as a real one does.
- Calls can be replayed from the UI, as the interceptor saw them. `DevpulDioInterceptor(dio: dio)` sends replays through that Dio's adapter and transformer.

## 1.0.0

- Stable, on devpul 1.0.0.

## 1.0.0-dev.1

- Requires Dart 3.8.

## 0.2.0

- Records where redirects ended.

## 0.1.0

- Initial release.
