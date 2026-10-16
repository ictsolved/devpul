---
title: Writing an HTTP adapter
description: Report requests from any Dart HTTP client to DevPul with DevpulHttp, DevpulHttpCall and DevpulForm.
---

The Dio and `package:http` adapters are thin layers over `DevpulHttp` in the core package. Use it to report calls from any other client: GraphQL clients, gRPC gateways, or your own wrapper. Adapters are for HTTP calls only; state, analytics and other data go through `Devpul.emit`, as in [Extending DevPul](/docs/extend/).

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
  headers: response?.headers.map ?? const {},
  body: response?.data,
);
```

Duration is measured from `request` to `response` or `error`.

## Bodies

- Strings that look like JSON are decoded, so the UI shows them as trees.
- `List<int>` shows as `<N bytes>`, or as a `data:` URL when the call's `content-type` is `image/*` and the URL fits `maxValueLength`; the UI previews it.
- `DevpulForm(fields: [...], files: [MapEntry('file', 'photo.png')])` shows multipart forms as a map and builds `-F` curl arguments.
- Anything else goes through `toJsonSafe`: maps and lists as they are, other objects as `toString()`.
- Values longer than `maxValueLength` are cut, with a preview.

Headers may be `Map<String, String>` or `Map<String, List<String>>`; single values become strings.

## A complete adapter

A wrapper that sends `package:http` requests through another client, `inner`:

```dart
Future<Response> send(Request request) async {
  final call = DevpulHttp.request(
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: request.body,
  );
  try {
    final response = await Response.fromStream(await inner.send(request));
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

## Mock rules

An adapter that passes `mockable: true` gets the rule that matches the call on `call.mock`, and acts on it. Without it, rules never apply to its calls.

```dart
final call = DevpulHttp.request(
  method: request.method,
  url: request.url,
  headers: request.headers,
  body: request.body,
  mockable: true,
);
final mock = call?.mock;
if (call != null && mock != null) {
  await Future<void>.delayed(mock.delay);
  switch (mock.mode) {
    case DevpulMockMode.respond:
      call.response(
        status: mock.status,
        headers: mock.headers,
        body: mock.body,
      );
      return Response(mock.body, mock.status, headers: mock.headers);
    case DevpulMockMode.fail:
      call.error(errorType: 'ClientException', message: mock.message);
      throw ClientException(mock.message, request.url);
    case DevpulMockMode.delay:
      break;
    case DevpulMockMode.pause:
      final edit = await call.pauseRequest(body: request.body);
      if (edit.abort) {
        call.error(errorType: 'ClientException', message: 'Aborted');
        throw ClientException('Aborted', request.url);
      }
      request = copy(request, edit);
  }
}
```

`pauseRequest` holds the call until the UI lets it go and posts `http.request` with what is sent; with a pause rule, `request` does not post it. Pass it the body as text, or as a map or list you send as JSON, to make it editable. Its `DevpulHttpEdit` has the fields that changed, or `abort`.

`pauseResponse` does the same for the response; call it before `response` and pass that what it returns:

```dart
final edit = await call.pauseResponse(
  status: response.statusCode,
  headers: response.headers,
  body: response.body,
);
```

Both return at once, unchanged, when the rule does not pause that side or no UI is connected.

## Replay

An adapter that passes `replay` lets the UI and agents send a call again. The callback gets a `DevpulHttpEdit` with the fields to change and sends the request as this call sent it, through what sits below the adapter; `replayBody` is the body to edit, as `pauseRequest` takes it.

```dart
final call = DevpulHttp.request(
  method: request.method,
  url: request.url,
  headers: request.headers,
  body: request.body,
  replay: (edit) => send(MockingAdapter.copy(request, edit)),
  replayBody: request.body,
);
```

The replay goes through the adapter again, so it shows as a call of its own with the call it replays as its cause.
