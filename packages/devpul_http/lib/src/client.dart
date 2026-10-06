import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:http/http.dart';

/// Wraps another client and reports each call to DevPul.
///
/// Response bodies are read in full and handed on unchanged, except
/// `text/event-stream`, which passes through untouched.
class DevpulClient extends BaseClient {
  DevpulClient([Client? inner]) : _inner = inner ?? Client();

  final Client _inner;

  @override
  Future<StreamedResponse> send(BaseRequest request) async {
    final call = DevpulHttp.request(
      method: request.method,
      url: request.url,
      headers: request.headers,
      body: _requestBody(request),
    );
    if (call == null) return _inner.send(request);

    final StreamedResponse response;
    try {
      response = await _inner.send(request);
    } catch (e) {
      call.error(errorType: e.runtimeType.toString(), message: e.toString());
      rethrow;
    }
    final finalUrl = switch (response) {
      BaseResponseWithUrl(:final url) => url,
      _ => null,
    };
    final type = response.headers['content-type'];
    if (type != null && type.contains('text/event-stream')) {
      call.response(
        status: response.statusCode,
        statusMessage: response.reasonPhrase,
        headers: response.headers,
        body: '<stream>',
        finalUrl: finalUrl,
      );
      return response;
    }

    final List<int> bytes;
    try {
      bytes = await response.stream.toBytes();
    } catch (e) {
      call.error(
        errorType: e.runtimeType.toString(),
        message: e.toString(),
        status: response.statusCode,
        headers: response.headers,
      );
      rethrow;
    }
    call.response(
      status: response.statusCode,
      statusMessage: response.reasonPhrase,
      headers: response.headers,
      body: _decode(bytes, type),
      finalUrl: finalUrl,
    );
    return StreamedResponse(
      ByteStream.fromBytes(bytes),
      response.statusCode,
      contentLength: response.contentLength,
      request: response.request,
      headers: response.headers,
      isRedirect: response.isRedirect,
      persistentConnection: response.persistentConnection,
      reasonPhrase: response.reasonPhrase,
    );
  }

  @override
  void close() => _inner.close();

  static Object? _requestBody(BaseRequest request) {
    switch (request) {
      case MultipartRequest(:final fields, :final files):
        return DevpulForm(
          fields: fields.entries.toList(),
          files: [
            for (final f in files) MapEntry(f.field, f.filename ?? 'file'),
          ],
        );
      case Request(:final bodyBytes, :final headers):
        if (bodyBytes.isEmpty) return null;
        final type = headers['content-type'];
        if (_isForm(type)) return request.bodyFields;
        return _decode(bodyBytes, type);
      default:
        return '<stream>';
    }
  }

  static bool _isForm(String? type) =>
      type != null && type.contains('application/x-www-form-urlencoded');

  static const _textTypes = [
    'json',
    'text/',
    'xml',
    'javascript',
    'form-urlencoded'
  ];

  // Text when the type says so or the bytes are valid UTF-8; bytes otherwise.
  static Object? _decode(List<int> bytes, String? type) {
    if (bytes.isEmpty) return null;
    if (type != null && _textTypes.any(type.contains)) {
      return utf8.decode(bytes, allowMalformed: true);
    }
    if (type != null) return bytes;
    try {
      return utf8.decode(bytes);
    } on FormatException {
      return bytes;
    }
  }
}
