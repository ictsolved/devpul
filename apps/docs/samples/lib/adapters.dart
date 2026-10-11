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
