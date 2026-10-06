import 'dart:convert';
import 'dart:typed_data';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:devpul_dio/devpul_dio.dart';
import 'package:dio/dio.dart';
import 'package:test/test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);

  final ResponseBody Function(RequestOptions options) respond;

  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async =>
      respond(options);

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(Object body, int status) => ResponseBody.fromString(
      jsonEncode(body),
      status,
      headers: {
        Headers.contentTypeHeader: [Headers.jsonContentType],
      },
    );

void main() {
  final events = <(String, Map<String, Object?>)>[];

  Dio dio(ResponseBody Function(RequestOptions) respond) =>
      Dio(BaseOptions(baseUrl: 'https://example.com/api'))
        ..httpClientAdapter = _Adapter(respond)
        ..interceptors.add(DevpulDioInterceptor());

  setUp(() {
    events.clear();
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugOnPost = (kind, event) => events.add((kind, event));
  });

  test('pairs request and response with the full URL', () async {
    await dio((_) => _json({'id': 7}, 200))
        .get<Object?>('/items', queryParameters: {'q': 'a b'});
    final [(k1, req), (k2, res)] = events;
    expect(k1, 'http.request');
    expect(k2, 'http.response');
    expect(req['url'], 'https://example.com/api/items?q=a+b');
    expect(req['params'], {'q': 'a b'});
    expect(
        req['curl'], startsWith("curl 'https://example.com/api/items?q=a+b'"));
    expect(res['id'], req['id']);
    expect(res['status'], 200);
    expect(res['body'], {'id': 7});
    expect(res['headers'], {'content-type': 'application/json'});
  });

  test('ids keep counting across Dio instances', () async {
    await dio((_) => _json({}, 200)).get<Object?>('/a');
    await dio((_) => _json({}, 200)).get<Object?>('/b');
    expect(events[2].$2['id'], isNot(events[0].$2['id']));
  });

  test('flattens FormData and builds -F curl', () async {
    final form = FormData.fromMap({
      'name': 'a',
      'file': MultipartFile.fromBytes([1, 2], filename: 'a.png'),
    });
    await dio((_) => _json({}, 201)).post<Object?>('/upload', data: form);
    final req = events.first.$2;
    expect(req['body'], {'name': 'a', 'file': 'a.png'});
    expect(req['curl'], contains("-F 'name=a'"));
    expect(req['curl'], contains("-F 'file=@a.png'"));
  });

  test('records where redirects ended', () async {
    await dio(
      (_) => ResponseBody(
        Stream.value(Uint8List.fromList(utf8.encode('{}'))),
        200,
        headers: {
          Headers.contentTypeHeader: [Headers.jsonContentType],
        },
        isRedirect: true,
        redirects: [
          RedirectRecord(302, 'GET', Uri.parse('/new')),
        ],
      ),
    ).get<Object?>('/old');
    final res = events.last.$2;
    expect(res['url'], 'https://example.com/api/old');
    expect(res['finalUrl'], 'https://example.com/new');
  });

  test('omits finalUrl without redirects', () async {
    await dio((_) => _json({}, 200)).get<Object?>('/same');
    expect(events.last.$2.containsKey('finalUrl'), isFalse);
  });

  test('reports bad responses as http.error with status and body', () async {
    await expectLater(
      dio((_) => _json({'error': 'nope'}, 404)).get<Object?>('/missing'),
      throwsA(isA<DioException>()),
    );
    final (kind, err) = events.last;
    expect(kind, 'http.error');
    expect(err['status'], 404);
    expect(err['errorType'], 'badResponse');
    expect(err['body'], {'error': 'nope'});
  });

  test('reports connection errors', () async {
    await expectLater(
      dio((_) => throw const FormatException('boom')).get<Object?>('/x'),
      throwsA(isA<DioException>()),
    );
    final (kind, err) = events.last;
    expect(kind, 'http.error');
    expect(err['status'], isNull);
    expect(err['errorType'], 'unknown');
  });

  test('skips ignored requests entirely', () async {
    Devpul.configure(
      const DevpulConfig(console: ConsoleMode.off, ignoreUrls: ['/health']),
    );
    await dio((_) => _json({}, 200)).get<Object?>('/health');
    expect(events, isEmpty);
  });
}
