import 'package:devpul/devpul.dart';
import 'package:dio/dio.dart' as dio;
import 'package:http/http.dart';

void calls(
  Uri uri,
  Map<String, String> headers,
  Object? body,
  Map<String, List<String>> responseHeaders,
  Object? decodedBody,
  Uri? redirectedTo,
  Object e,
  dio.Response<Object?>? response,
) {
  final call = DevpulHttp.request(
    method: 'POST',
    url: uri,
    headers: headers,
    body: body,
  );

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
}

final class Adapter {
  Adapter(this.inner);

  final Client inner;

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
}

final class MockingAdapter {
  MockingAdapter(this.inner);

  final Client inner;

  Future<Response> send(Request request) async {
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
    var response = await Response.fromStream(await inner.send(request));
    if (call != null && mock?.mode == DevpulMockMode.pause) {
      final edit = await call.pauseResponse(
        status: response.statusCode,
        headers: response.headers,
        body: response.body,
      );
      response = Response(
        edit.body ?? response.body,
        edit.status ?? response.statusCode,
        headers: edit.headers ?? response.headers,
      );
    }
    call?.response(
      status: response.statusCode,
      headers: response.headers,
      body: response.body,
    );
    return response;
  }

  static Request copy(Request request, DevpulHttpEdit edit) =>
      Request(edit.method ?? request.method, edit.url ?? request.url)
        ..headers.addAll(edit.headers ?? request.headers)
        ..body = edit.body ?? request.body;
}

final class ReplayingAdapter {
  ReplayingAdapter(this.inner);

  final Client inner;

  Future<Response> send(Request request) async {
    final call = DevpulHttp.request(
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: request.body,
      replay: (edit) => send(MockingAdapter.copy(request, edit)),
      replayBody: request.body,
    );
    final response = await Response.fromStream(await inner.send(request));
    call?.response(
      status: response.statusCode,
      headers: response.headers,
      body: response.body,
    );
    return response;
  }
}
