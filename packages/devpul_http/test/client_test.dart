import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:devpul_http/devpul_http.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';

void main() {
  final events = <(String, Map<String, Object?>)>[];

  setUp(() {
    events.clear();
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugOnPost = (kind, event) => events.add((kind, event));
  });

  DevpulClient client(MockClientHandler handler) =>
      DevpulClient(MockClient(handler));

  test('pairs request and response and keeps the body for the caller',
      () async {
    final c = client(
      (_) async => http.Response(
        jsonEncode({'id': 7}),
        200,
        headers: {'content-type': 'application/json'},
      ),
    );
    final res = await c.post(
      Uri.parse('https://example.com/items?q=a'),
      headers: {'content-type': 'application/json'},
      body: jsonEncode({'sku': 'abc'}),
    );
    expect(jsonDecode(res.body), {'id': 7});
    final [(k1, req), (k2, end)] = events;
    expect(k1, 'http.request');
    expect(k2, 'http.response');
    expect(req['method'], 'POST');
    expect(req['url'], 'https://example.com/items?q=a');
    expect(req['params'], {'q': 'a'});
    expect(req['body'], {'sku': 'abc'});
    expect(req['curl'], contains('--data-raw'));
    expect(end['id'], req['id']);
    expect(end['status'], 200);
    expect(end['body'], {'id': 7});
  });

  test('shows form fields and multipart files', () async {
    final c = client((_) async => http.Response('', 204));
    await c.post(Uri.parse('https://example.com/f'), body: {'a': '1'});
    expect(events.first.$2['body'], {'a': '1'});

    events.clear();
    final multi = http.MultipartRequest(
        'POST', Uri.parse('https://example.com/u'))
      ..fields['note'] = 'hi'
      ..files
          .add(http.MultipartFile.fromBytes('file', [1, 2], filename: 'a.png'));
    await c.send(multi);
    expect(events.first.$2['body'], {'note': 'hi', 'file': 'a.png'});
    expect(events.last.$2['body'], isNull);
  });

  test('binary bodies show as a byte count', () async {
    final c = client(
      (_) async => http.Response.bytes(
        [0xff, 0xfe, 0x00],
        200,
        headers: {'content-type': 'image/png'},
      ),
    );
    final res = await c.get(Uri.parse('https://example.com/i.png'));
    expect(res.bodyBytes, [0xff, 0xfe, 0x00]);
    expect(events.last.$2['body'], '<3 bytes>');
  });

  test('reports client exceptions and rethrows', () async {
    final c = client((_) async => throw http.ClientException('refused'));
    await expectLater(
      c.get(Uri.parse('https://example.com/x')),
      throwsA(isA<http.ClientException>()),
    );
    final (kind, err) = events.last;
    expect(kind, 'http.error');
    expect(err['errorType'], 'ClientException');
    expect(err['message'], contains('refused'));
  });

  test('skips ignored requests entirely', () async {
    Devpul.configure(
      const DevpulConfig(console: ConsoleMode.off, ignoreUrls: ['/health']),
    );
    final c = client((_) async => http.Response('ok', 200));
    expect((await c.get(Uri.parse('https://example.com/health'))).body, 'ok');
    expect(events, isEmpty);
  });
}
