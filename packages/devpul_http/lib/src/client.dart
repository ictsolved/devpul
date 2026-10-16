import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:http/http.dart';

/// Wraps another client and reports each call to DevPul.
///
/// Response bodies are read in full and handed on unchanged, except
/// `text/event-stream`, which passes through untouched. Mock rules from the
/// UI answer, fail, delay or pause calls here. A [Request] can be replayed
/// from the UI: it goes out again through the wrapped client.
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
      mockable: true,
      // Reads request when replayed: by then what was sent, edits included.
      replay: request is Request ? (edit) => _replay(request, edit) : null,
      replayBody: _editable(request),
    );
    if (call == null) return _inner.send(request);

    final mock = call.mock;
    if (mock != null && mock.mode != DevpulMockMode.pause) {
      if (mock.delay > Duration.zero) await Future<void>.delayed(mock.delay);
      if (mock.mode == DevpulMockMode.fail) {
        _fail(call, mock.message, request.url);
      }
      if (mock.mode == DevpulMockMode.respond) {
        final bytes = utf8.encode(mock.body);
        call.response(
          status: mock.status,
          headers: mock.headers,
          body: _decode(bytes, _type(mock.headers)),
        );
        return StreamedResponse(
          ByteStream.fromBytes(bytes),
          mock.status,
          contentLength: bytes.length,
          request: request,
          headers: mock.headers,
        );
      }
    }
    if (mock?.mode == DevpulMockMode.pause) {
      final edit = await call.pauseRequest(body: _editable(request));
      if (edit.abort) _fail(call, _aborted, request.url);
      if (edit.changed) request = _rebuild(request, edit);
    }

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

    List<int> bytes;
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
    var status = response.statusCode;
    var reason = response.reasonPhrase;
    var headers = response.headers;
    final edit = mock == null
        ? const DevpulHttpEdit()
        : await call.pauseResponse(
            status: status,
            statusMessage: reason,
            headers: headers,
            // Empty shows as editable text, so a body can be added.
            body: bytes.isEmpty ? '' : _decode(bytes, type),
          );
    if (edit.abort) _fail(call, _aborted, request.url);
    status = edit.status ?? status;
    reason = edit.statusMessage ?? reason;
    headers = edit.headers ?? headers;
    if (edit.body case final body?) {
      bytes = utf8.encode(body);
      headers = {
        for (final MapEntry(:key, :value) in headers.entries)
          if (key.toLowerCase() != 'content-length') key: value,
      };
    }
    call.response(
      status: status,
      statusMessage: reason,
      headers: headers,
      body: _decode(bytes, _type(headers)),
      finalUrl: finalUrl,
    );
    return StreamedResponse(
      ByteStream.fromBytes(bytes),
      status,
      contentLength: edit.body == null ? response.contentLength : bytes.length,
      request: response.request,
      headers: headers,
      isRedirect: response.isRedirect,
      persistentConnection: response.persistentConnection,
      reasonPhrase: reason,
    );
  }

  static const _aborted = 'Aborted at a DevPul breakpoint';

  Future<void> _replay(BaseRequest request, DevpulHttpEdit edit) async {
    final response = await send(_rebuild(request, edit));
    // An event stream nobody reads would keep the connection open.
    await response.stream.listen(null).cancel();
  }

  static Never _fail(DevpulHttpCall call, String message, Uri url) {
    call.error(errorType: 'ClientException', message: message);
    throw ClientException(message, url);
  }

  static String? _type(Map<String, String> headers) {
    for (final MapEntry(:key, :value) in headers.entries) {
      if (key.toLowerCase() == 'content-type') return value;
    }
    return null;
  }

  // Only a plain request's body can be edited; it is sent as bytes again.
  static String? _editable(BaseRequest request) {
    if (request is! Request) return null;
    if (request.bodyBytes.isEmpty) return '';
    final body = _decode(request.bodyBytes, request.headers['content-type']);
    return body is String ? body : null;
  }

  static BaseRequest _rebuild(BaseRequest request, DevpulHttpEdit edit) {
    final method = edit.method ?? request.method;
    final url = edit.url ?? request.url;
    // Read before the headers: a multipart request sets its boundary here.
    final body = request is Request ? null : request.finalize();
    final headers = {
      for (final MapEntry(:key, :value)
          in (edit.headers ?? request.headers).entries)
        if (key.toLowerCase() != 'content-length') key: value,
      if (request is MultipartRequest)
        'content-type': request.headers['content-type']!,
    };
    final BaseRequest copy;
    if (request is Request) {
      copy = Request(method, url)
        ..bodyBytes = edit.body == null
            ? request.bodyBytes
            : request.encoding.encode(edit.body!);
    } else {
      final streamed = StreamedRequest(method, url)
        ..contentLength = request.contentLength;
      body!.listen(
        streamed.sink.add,
        onError: streamed.sink.addError,
        onDone: streamed.sink.close,
      );
      copy = streamed;
    }
    return copy
      ..headers.addAll(headers)
      ..followRedirects = request.followRedirects
      ..maxRedirects = request.maxRedirects
      ..persistentConnection = request.persistentConnection;
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
    'form-urlencoded',
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
