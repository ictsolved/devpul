import 'dart:async';
import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:dio/dio.dart';

/// Add it last so it sees headers set by other interceptors.
///
/// Mock rules from the UI answer, fail, delay or pause calls here. A mocked
/// response or failure still passes through every interceptor, as a real
/// one does.
class DevpulDioInterceptor extends Interceptor {
  static const _key = 'devpul.call';
  static const _pausedKey = 'devpul.paused';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    final call = DevpulHttp.request(
      method: options.method,
      url: options.uri,
      headers: options.headers,
      body: _body(options.data),
      mockable: true,
    );
    if (call != null) options.extra[_key] = call;
    final mock = call?.mock;
    if (call == null || mock == null) return handler.next(options);
    unawaited(_mock(call, mock, options, handler));
  }

  static Future<void> _mock(
    DevpulHttpCall call,
    DevpulMock mock,
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    if (mock.mode != DevpulMockMode.pause && mock.delay > Duration.zero) {
      await Future<void>.delayed(mock.delay);
    }
    switch (mock.mode) {
      case DevpulMockMode.delay:
        handler.next(options);
      case DevpulMockMode.fail:
        handler.reject(_failure(options, mock.message), true);
      case DevpulMockMode.respond:
        final response = Response<dynamic>(
          requestOptions: options,
          data: _decode(options, mock.status, mock.body, mock.headers),
          statusCode: mock.status,
          headers: Headers.fromMap({
            for (final MapEntry(:key, :value) in mock.headers.entries)
              key: [value],
          }),
        );
        if (options.validateStatus(mock.status)) {
          handler.resolve(response, true);
        } else {
          handler.reject(_badResponse(response), true);
        }
      case DevpulMockMode.pause:
        final data = options.data;
        final edit = await call.pauseRequest(body: _editable(data));
        if (edit.abort) {
          return handler.reject(_failure(options, _aborted), true);
        }
        if (edit.method case final method?) options.method = method;
        if (edit.url case final url?) {
          options
            ..path = '$url'
            ..queryParameters = {};
        }
        if (edit.headers case final headers?) {
          options.headers = _withoutLength(headers);
        }
        if (edit.body case final body?) options.data = _rebuild(data, body);
        handler.next(options);
    }
  }

  @override
  void onResponse(
    Response<dynamic> response,
    ResponseInterceptorHandler handler,
  ) {
    final call = response.requestOptions.extra[_key];
    if (call is! DevpulHttpCall) return handler.next(response);
    if (call.mock?.mode != DevpulMockMode.pause) {
      _logResponse(call, response);
      return handler.next(response);
    }
    unawaited(() async {
      final options = response.requestOptions;
      // onError, which the rejections below reach, only logs it then.
      options.extra[_pausedKey] = true;
      if (!await _pause(call, response)) {
        return handler.reject(_failure(options, _aborted), true);
      }
      if (!options.validateStatus(response.statusCode)) {
        return handler.reject(_badResponse(response), true);
      }
      _logResponse(call, response);
      handler.next(response);
    }());
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) {
    final call = err.requestOptions.extra[_key];
    if (call is! DevpulHttpCall) return handler.next(err);
    final response = err.response;
    if (response == null ||
        call.mock?.mode != DevpulMockMode.pause ||
        err.requestOptions.extra[_pausedKey] == true ||
        err.type != DioExceptionType.badResponse) {
      _logError(call, err);
      return handler.next(err);
    }
    unawaited(() async {
      if (!await _pause(call, response)) {
        final error = _failure(err.requestOptions, _aborted);
        _logError(call, error);
        return handler.next(error);
      }
      if (err.requestOptions.validateStatus(response.statusCode)) {
        _logResponse(call, response);
        return handler.resolve(response);
      }
      final error = _badResponse(response);
      _logError(call, error);
      handler.next(error);
    }());
  }

  static void _logResponse(DevpulHttpCall call, Response<dynamic> response) {
    call.response(
      status: response.statusCode,
      statusMessage: response.statusMessage,
      headers: response.headers.map,
      body: _body(response.data),
      finalUrl: response.realUri,
    );
  }

  static void _logError(DevpulHttpCall call, DioException err) {
    final response = err.response;
    call.error(
      errorType: err.type.name,
      message: err.message ?? err.error?.toString(),
      status: response?.statusCode,
      headers: response?.headers.map ?? const {},
      body: _body(response?.data),
    );
  }

  /// Applies a breakpoint's edits to [response]; false when aborted.
  static Future<bool> _pause(
    DevpulHttpCall call,
    Response<dynamic> response,
  ) async {
    final data = response.data;
    final edit = await call.pauseResponse(
      status: response.statusCode,
      statusMessage: response.statusMessage,
      headers: response.headers.map,
      body: _editable(data),
    );
    if (edit.abort) return false;
    if (edit.status case final status?) response.statusCode = status;
    if (edit.statusMessage case final message?) {
      response.statusMessage = message;
    }
    if (edit.headers case final headers?) {
      response.headers = Headers.fromMap({
        for (final MapEntry(:key, :value) in _withoutLength(headers).entries)
          key: [value],
      });
    }
    if (edit.body case final body?) {
      response
        ..data = _rebuild(data, body)
        ..headers.removeAll(Headers.contentLengthHeader);
    }
    return true;
  }

  static const _aborted = 'Aborted at a DevPul breakpoint';

  // Empty shows as editable text, so a body can be added.
  static Object? _editable(Object? data) => switch (data) {
    null => '',
    String() || Map<Object?, Object?>() || List<Object?>() => data,
    _ => null,
  };

  static DioException _failure(RequestOptions options, String message) =>
      DioException.connectionError(requestOptions: options, reason: message);

  static DioException _badResponse(Response<dynamic> response) =>
      DioException.badResponse(
        statusCode: response.statusCode!,
        requestOptions: response.requestOptions,
        response: response,
      );

  static Map<String, String> _withoutLength(Map<String, String> headers) => {
    for (final MapEntry(:key, :value) in headers.entries)
      if (key.toLowerCase() != 'content-length') key: value,
  };

  // Edited JSON goes back as the map or list it came from.
  static Object? _rebuild(Object? original, String edited) {
    if (original is! Map && original is! List) return edited;
    try {
      return jsonDecode(edited);
    } on FormatException {
      return edited;
    }
  }

  // As Dio's transformer would hand the body over for the response type.
  static Object? _decode(
    RequestOptions options,
    int status,
    String body,
    Map<String, String> headers,
  ) {
    final type = headers.entries
        .where((e) => e.key.toLowerCase() == 'content-type')
        .map((e) => e.value)
        .firstOrNull;
    switch (options.responseType) {
      case ResponseType.bytes:
        return utf8.encode(body);
      case ResponseType.stream:
        return ResponseBody.fromString(body, status);
      case ResponseType.plain:
        return body;
      case ResponseType.json:
        if (body.isEmpty) return type == null ? body : null;
        if (type != null && !Transformer.isJsonMimeType(type)) return body;
        try {
          return jsonDecode(body);
        } on FormatException {
          return body;
        }
    }
  }

  static Object? _body(Object? data) => switch (data) {
    FormData(:final fields, :final files) => DevpulForm(
      fields: fields,
      files: [
        for (final f in files) MapEntry(f.key, f.value.filename ?? 'file'),
      ],
    ),
    Stream<Object?>() || ResponseBody() => '<stream>',
    _ => data,
  };
}
