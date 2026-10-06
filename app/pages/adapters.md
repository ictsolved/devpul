---
title: Writing an HTTP adapter
description: Report requests from any Dart HTTP client to DevPul with DevpulHttp, DevpulHttpCall and DevpulForm.
---

# Writing an HTTP adapter

The Dio and `package:http` adapters are thin layers over `DevpulHttp` in the core package. Use it to report calls from any other client: GraphQL clients, gRPC gateways, or your own wrapper. Adapters are for HTTP calls only; state, analytics and other data go through `Devpul.emit`, as in [Extending DevPul](%ROOT%docs/extend/).

## The calls

```dart
final call = DevpulHttp.request(
  method: 'POST',
  url: uri,
  headers: headers,
  body: body,
);
```

`request` returns `null` when DevPul is disabled or the call matches an ignore rule; skip the rest then. Otherwise it emits `http.request` with a new id, the params, a curl command and a console line, after redaction.

Finish the call exactly once:

```dart
call?.response(
  status: 200,
  statusMessage: 'OK',
  headers: responseHeaders,
  body: decodedBody,
  finalUrl: redirectedTo,
);

call?.error(
  errorType: 'connectionTimeout',
  message: e.toString(),
  status: response?.statusCode,
  headers: response?.headers ?? const {},
  body: response?.data,
);
```

Duration is measured from `request` to `response` or `error`.

## Bodies

- Strings that look like JSON are decoded, so the UI shows them as trees.
- `List<int>` shows as `<N bytes>`.
- `DevpulForm(fields: [...], files: [MapEntry('file', 'photo.png')])` shows multipart forms as a map and builds `-F` curl arguments.
- Anything else goes through `toJsonSafe`: maps and lists as they are, other objects as `toString()`.
- Values longer than `maxValueLength` are cut, with a preview.

Headers may be `Map<String, String>` or `Map<String, List<String>>`; single values become strings.

## A complete adapter

```dart
Future<Response> send(Request request) async {
  final call = DevpulHttp.request(
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  );
  try {
    final response = await inner.send(request);
    call?.response(
      status: response.statusCode,
      headers: response.headers,
      body: response.body,
    );
    return response;
  } catch (e) {
    call?.error(errorType: e.runtimeType.toString(), message: '$e');
    rethrow;
  }
}
```

Keep the adapter free of side effects on the request: read bodies without consuming streams the client still needs, and rethrow what you catch. The `devpul_http` [source](%REPO_URL%/tree/main/packages/devpul_http) shows buffering a streamed response and handing it on unchanged.
