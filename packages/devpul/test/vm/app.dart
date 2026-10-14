import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'dart:io';
import 'dart:isolate';

import 'package:devpul/devpul.dart';

// Run by vm_service_test.dart under a VM service, paused on start.
void main() {
  Devpul.configure(const DevpulConfig(ansiColors: false));
  Devpul.session({'name': 'e2e'}, tags: {'flavor': 'test'});
  Devpul.action(
    'echo',
    (args) => args['text'],
    params: const [DevpulParam.text('text', initial: 'pong')],
  );
  Devpul.plugin('e2e', () => 'export default {}');
  final cart = <String, Object?>{};
  Devpul.handle('cart.set', (args) => cart..addAll(args), writes: true);
  Devpul.handle('http.fetch', (_) => _fetch());
  Devpul.log('hello', level: 'warn');
  developer.log(
    'token refresh failed',
    name: 'auth',
    level: 900,
    error: StateError('expired'),
    stackTrace: StackTrace.fromString(
      '#0      main (file:///app/main.dart:5:3)',
    ),
  );
  developer.log('{"items": [${List.filled(40, '"sku-1"').join(', ')}]}');
  DevpulHttp.request(
    method: 'get',
    url: Uri.parse('https://example.com/items'),
  )?.response(status: 200, body: {'ok': true});
  // After the info event, which goes out in a microtask.
  scheduleMicrotask(() => Devpul.error(StateError('boom'), StackTrace.current));
  // Stay alive for service extension calls; the test kills the process.
  ReceivePort();
}

/// Requests through a plain `HttpClient` for the dart:io HTTP profile: JSON,
/// a POST body, a redirect and a refused connection. Returns the ports used.
Future<Map<String, int>> _fetch() async {
  final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
  server.defaultResponseHeaders.clear();
  server.listen((request) async {
    final body = await utf8.decoder.bind(request).join();
    final response = request.response;
    if (request.uri.path == '/old') {
      await response.redirect(Uri.parse('/items'));
      return;
    }
    response.headers.contentType = ContentType.json;
    if (request.method == 'POST') {
      response
        ..statusCode = HttpStatus.created
        ..write(body);
    } else {
      response.write('{"ok":true}');
    }
    await response.close();
  });
  final closed = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
  final refused = closed.port;
  await closed.close();

  final client = HttpClient();
  Future<void> send(String method, Uri url, [String? body]) async {
    final request = await client.openUrl(method, url);
    if (body != null) {
      request.headers.contentType = ContentType.json;
      request.write(body);
    }
    await (await request.close()).drain<void>();
  }

  final base = Uri.parse('http://127.0.0.1:${server.port}');
  await send('GET', base.resolve('/items?page=1'));
  await send('POST', base.resolve('/items'), '{"sku":"abc-1","qty":2}');
  await send('GET', base.resolve('/old'));
  try {
    await send('GET', Uri.parse('http://127.0.0.1:$refused/down'));
  } on SocketException {
    // Recorded as the request's error.
  }
  client.close();
  await server.close();
  return {'server': base.port, 'refused': refused};
}
