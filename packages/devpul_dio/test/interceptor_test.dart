import 'dart:convert';
import 'dart:typed_data';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunCall;
import 'package:devpul/src/mock.dart';
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
  ) async => respond(options);

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
    debugOnPost = (kind, event) =>
        events.add((kind, event['data']! as Map<String, Object?>));
  });

  test('pairs request and response with the full URL', () async {
    await dio(
      (_) => _json({'id': 7}, 200),
    ).get<Object?>('/items', queryParameters: {'q': 'a b'});
    final [(k1, req), (k2, res)] = events;
    expect(k1, 'http.request');
    expect(k2, 'http.response');
    expect(req['url'], 'https://example.com/api/items?q=a+b');
    expect(req['params'], {'q': 'a b'});
    expect(
      req['curl'],
      startsWith("curl 'https://example.com/api/items?q=a+b'"),
    );
    expect(res['id'], req['id']);
    expect(res['status'], 200);
    expect(res['body'], {'id': 7});
    expect(res['headers'], {'content-type': 'application/json'});
  });

  test('sends image bytes as a data URL', () async {
    await dio(
      (_) => ResponseBody.fromBytes(
        [71, 73, 70],
        200,
        headers: {
          Headers.contentTypeHeader: ['image/gif'],
        },
      ),
    ).get<List<int>>(
      '/logo.gif',
      options: Options(responseType: ResponseType.bytes),
    );
    expect(events.last.$2['body'], 'data:image/gif;base64,R0lG');
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
        redirects: [RedirectRecord(302, 'GET', Uri.parse('/new'))],
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

  group('mocks', () {
    Future<void> rules(List<Map<String, Object?>> rules) async {
      await debugRunCall('http.mocks.set', {'rules': rules});
      events.removeWhere((e) => e.$1 == 'http.mocks');
    }

    Map<String, Object?> last(String kind) =>
        events.lastWhere((e) => e.$1 == kind).$2;

    Future<void> resume(Map<String, Object?> args) async {
      while (!events.any((e) => e.$1 == 'http.paused')) {
        await Future<void>.delayed(Duration.zero);
      }
      final id = last('http.paused')['id'];
      events.removeWhere((e) => e.$1 == 'http.paused');
      await debugRunCall('http.resume', {'id': id, ...args});
    }

    setUpAll(() => Mocks.register(Devpul.handle));
    setUp(() => debugListening = () => true);
    tearDown(() => rules([]));

    test('respond through the other interceptors', () async {
      await rules([
        {
          'url': '*/items',
          'headers': {'content-type': 'application/json'},
          'body': '{"id":1}',
        },
      ]);
      final seen = <int?>[];
      final client = dio((_) => fail('sent'));
      client.interceptors.insert(
        0,
        InterceptorsWrapper(
          onResponse: (r, h) {
            seen.add(r.statusCode);
            h.next(r);
          },
        ),
      );
      final res = await client.get<Object?>('/items');
      expect(res.data, {'id': 1});
      expect(seen, [200]);
      expect(last('http.response')['mock'], 'respond');
    });

    test('respond with plain and bytes response types', () async {
      await rules([
        {'url': '*', 'body': '{"id":1}'},
      ]);
      final client = dio((_) => fail('sent'));
      final plain = await client.get<String>('/a');
      expect(plain.data, '{"id":1}');
      final bytes = await client.get<List<int>>(
        '/a',
        options: Options(responseType: ResponseType.bytes),
      );
      expect(utf8.decode(bytes.data!), '{"id":1}');
    });

    test('a mocked error status throws as a real one does', () async {
      await rules([
        {'url': '*', 'status': 503, 'body': 'down'},
      ]);
      await expectLater(
        dio((_) => fail('sent')).get<Object?>('/items'),
        throwsA(
          isA<DioException>()
              .having((e) => e.type, 'type', DioExceptionType.badResponse)
              .having((e) => e.response?.data, 'data', 'down'),
        ),
      );
      expect(last('http.error')['status'], 503);
      expect(last('http.error')['mock'], 'respond');
    });

    test('fail as a connection error', () async {
      await rules([
        {'url': '*', 'mode': 'fail', 'message': 'offline'},
      ]);
      await expectLater(
        dio((_) => fail('sent')).get<Object?>('/items'),
        throwsA(
          isA<DioException>().having(
            (e) => e.type,
            'type',
            DioExceptionType.connectionError,
          ),
        ),
      );
      expect(last('http.error')['mock'], 'fail');
    });

    test('edit the request at a breakpoint', () async {
      await rules([
        {'url': '*', 'mode': 'pause'},
      ]);
      late RequestOptions sent;
      final res = dio((o) {
        sent = o;
        return _json({'ok': true}, 200);
      }).post<Object?>('/items', data: {'n': 1}, queryParameters: {'q': 'a'});
      await resume({
        'url': 'https://example.com/api/other?q=b',
        'headers': {'x-b': '2'},
        'body': '{"n": 2}',
      });
      await res;
      expect(sent.uri, Uri.parse('https://example.com/api/other?q=b'));
      expect(sent.headers['x-b'], '2');
      expect(sent.data, {'n': 2});
      expect(last('http.request')['body'], {'n': 2});
    });

    test('turn an error response into a success', () async {
      await rules([
        {'url': '*', 'mode': 'pause', 'request': false, 'response': true},
      ]);
      final res = dio((_) => _json({'ok': false}, 500)).get<Object?>('/a');
      await resume({'status': 200, 'body': '{"ok": true}'});
      final done = await res;
      expect(done.statusCode, 200);
      expect(done.data, {'ok': true});
      expect(last('http.response')['mock'], 'pause');
      expect(events.where((e) => e.$1 == 'http.error'), isEmpty);
    });

    test('turn a success into an error response', () async {
      await rules([
        {'url': '*', 'mode': 'pause', 'request': false, 'response': true},
      ]);
      final res = expectLater(
        dio((_) => _json({'ok': true}, 200)).get<Object?>('/a'),
        throwsA(
          isA<DioException>().having(
            (e) => e.response?.statusCode,
            'status',
            401,
          ),
        ),
      );
      await resume({'status': 401});
      await res;
      expect(events.where((e) => e.$1 == 'http.paused'), isEmpty);
      expect(
        events.where((e) => e.$1 == 'http.error').single.$2['status'],
        401,
      );
    });

    test('abort at a breakpoint', () async {
      await rules([
        {'url': '*', 'mode': 'pause'},
      ]);
      final res = expectLater(
        dio((_) => fail('sent')).get<Object?>('/a'),
        throwsA(isA<DioException>()),
      );
      await resume({'abort': true});
      await res;
      expect(last('http.error')['errorType'], 'connectionError');
    });
  });
}
