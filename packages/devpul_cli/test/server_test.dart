import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/server.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

const contract = '../../contract/app/lib/devpul';

void main() {
  late Directory root;
  late File plugin;
  late String folder;
  late UiServer server;
  late List<String> opened;
  final client = HttpClient();

  setUp(() async {
    root = await Directory.systemTemp.createTemp('devpul_ui');
    addTearDown(() => root.delete(recursive: true));
    File('${root.path}/index.html').writeAsStringSync('<head></head>app');
    Directory('${root.path}/help').createSync();
    File('${root.path}/help/index.html').writeAsStringSync('help');
    File('${root.path}/.hidden.js').writeAsStringSync('');
    plugin = File('${root.path}/plugin.js')..writeAsStringSync('export {}');
    folder = '${root.path}/cart';
    for (final file in Directory(
      '$contract/cart',
    ).listSync().whereType<File>()) {
      file.copySync(
        '${(Directory(folder)..createSync()).path}/${p.basename(file.path)}',
      );
    }
    opened = [];
    server = await UiServer.bind(
      0,
      root: root,
      open: opened.add,
      // Relative, as --plugin . gives it.
      plugins: [plugin.path, p.join(p.relative(folder), '.')],
    );
    addTearDown(server.close);
  });

  Future<HttpClientResponse> send(
    String path, {
    String method = 'GET',
    Map<String, String> headers = const {},
    Object? body,
  }) async {
    final request = await client.openUrl(method, server.url.resolve(path))
      ..followRedirects = false;
    headers.forEach(request.headers.set);
    if (body != null) request.write(jsonEncode(body));
    return request.close();
  }

  Future<(int, String)> get(String path, {Map<String, String>? headers}) async {
    final response = await send(path, headers: headers ?? const {});
    return (response.statusCode, await utf8.decodeStream(response));
  }

  test('serves the build and marks the page', () async {
    final (status, body) = await get('/');
    expect(status, 200);
    expect(body, contains('<meta name="devpul-cli"'));
    expect(await get('/help/'), (200, 'help'));
    final help = await send('/help');
    expect(help.statusCode, 301);
    expect(help.headers.value('location'), '/help/');
  });

  test('refuses other host names, hidden files and paths outside', () async {
    expect((await get('/', headers: {'host': 'evil.example.com'})).$1, 403);
    expect((await get('/.hidden.js')).$1, 404);
    expect((await get('/..%2Fsecret.html')).$1, 404);
    expect((await get('/missing.js')).$1, 404);
  });

  test('takes connect requests only with the token', () async {
    final body = {'url': 'http://127.0.0.1:1/a=/'};
    expect(
      (await send('cli/connect', method: 'POST', body: body)).statusCode,
      403,
    );
    final ok = await send(
      'cli/connect',
      method: 'POST',
      headers: {tokenHeader: server.token},
      body: body,
    );
    expect(ok.statusCode, 204);
    // No tab listens, so one opens.
    expect(opened, [
      '${server.url}#connect=http%3A%2F%2F127.0.0.1%3A1%2Fa%3D%2F',
    ]);
  });

  test('sends URLs and plugin changes to open tabs', () async {
    final response = await send('cli/events');
    expect(response.headers.contentType?.mimeType, 'text/event-stream');
    final messages = StreamIterator(
      utf8.decoder
          .bind(response)
          .expand((chunk) => chunk.split('\n\n'))
          .where((m) => m.startsWith('data: '))
          .map((m) => jsonDecode(m.substring(6))),
    );
    Future<Object?> next() async {
      expect(
        await messages.moveNext().timeout(const Duration(seconds: 5)),
        isTrue,
      );
      return messages.current;
    }

    expect(await next(), {
      'plugins': ['cli/plugins/0/plugin.js?v=0', 'cli/plugins/1/cart.js?v=0'],
    });
    server.connect('ws://127.0.0.1:1/a=/ws');
    expect(await next(), {'connect': 'ws://127.0.0.1:1/a=/ws'});
    expect(opened, isEmpty);

    // Saved the way editors do: a new file renamed over the old one.
    File('${root.path}/plugin.js.tmp')
      ..writeAsStringSync('export default 1')
      ..renameSync(plugin.path);
    expect(await next(), {
      'plugins': ['cli/plugins/0/plugin.js?v=1', 'cli/plugins/1/cart.js?v=0'],
    });
    expect(await get('cli/plugins/0/plugin.js'), (200, 'export default 1'));
    expect((await get('cli/plugins/0/other.js')).$1, 404);

    File('$folder/icon.svg').writeAsStringSync('<svg></svg>');
    expect(await next(), {
      'plugins': ['cli/plugins/0/plugin.js?v=1', 'cli/plugins/1/cart.js?v=1'],
    });
    await messages.cancel();
  });

  test('serves a plugin folder as an app gets it, or its problems', () async {
    // contract/app holds the vendored copy, which leaves out the readme.
    expect(await get('cli/plugins/1/cart.js'), (
      200,
      'throw new Error("$folder: README.md: missing");\n',
    ));
    File('$folder/icon.svg').renameSync('$folder/icon');
    expect(await get('cli/plugins/1/cart.js'), (
      200,
      'throw new Error("$folder: icon.svg: missing; README.md: missing");\n',
    ));
    File('$folder/icon').renameSync('$folder/icon.svg');
    File('$folder/README.md').writeAsStringSync('# Cart\n');
    final (status, body) = await get('cli/plugins/1/cart.js');
    expect(status, 200);
    expect(body, startsWith(File('$folder/cart.js').readAsStringSync()));
    expect(body, contains('export const icon = "<svg xmlns='));
  });
}
