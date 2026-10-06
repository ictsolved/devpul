import 'package:devpul/devpul.dart';
import 'package:dio/dio.dart';

/// Add it last so it sees headers set by other interceptors.
class DevpulDioInterceptor extends Interceptor {
  static const _key = 'devpul.call';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final call = DevpulHttp.request(
      method: options.method,
      url: options.uri,
      headers: options.headers,
      body: _body(options.data),
    );
    if (call != null) options.extra[_key] = call;
    handler.next(options);
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final call = response.requestOptions.extra[_key];
    if (call is DevpulHttpCall) {
      call.response(
        status: response.statusCode,
        statusMessage: response.statusMessage,
        headers: response.headers.map,
        body: _body(response.data),
        finalUrl: response.realUri,
      );
    }
    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final call = err.requestOptions.extra[_key];
    if (call is DevpulHttpCall) {
      final response = err.response;
      call.error(
        errorType: err.type.name,
        message: err.message ?? err.error?.toString(),
        status: response?.statusCode,
        headers: response?.headers.map ?? const {},
        body: _body(response?.data),
      );
    }
    handler.next(err);
  }

  static Object? _body(Object? data) => switch (data) {
        FormData(:final fields, :final files) => DevpulForm(
            fields: fields,
            files: [
              for (final f in files)
                MapEntry(f.key, f.value.filename ?? 'file'),
            ],
          ),
        Stream<Object?>() || ResponseBody() => '<stream>',
        _ => data,
      };
}
