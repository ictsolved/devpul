import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:watcher/watcher.dart';

import 'plugins/check.dart';
import 'plugins/render.dart';
import 'watch.dart';

const _types = {
  'html': 'text/html; charset=utf-8',
  'css': 'text/css; charset=utf-8',
  'js': 'text/javascript; charset=utf-8',
  'svg': 'image/svg+xml',
  'png': 'image/png',
  'webmanifest': 'application/manifest+json',
  'txt': 'text/plain; charset=utf-8',
};

/// Header that carries the token on control requests. A custom header also
/// makes browsers preflight cross-origin requests, which this server refuses.
const tokenHeader = 'x-devpul-token';

String connectLink(Uri base, String vmUrl) =>
    '$base#connect=${Uri.encodeComponent(vmUrl)}';

/// Serves the UI build in [root] on 127.0.0.1. Open tabs listen on
/// `/cli/events` for VM service URLs to connect to and for plugin modules,
/// served from `/cli/plugins/`, which reload when a file changes. A plugin
/// folder serves its module as an app gets it, with the icon. Other
/// devpul processes send URLs to `/cli/connect` and read the last one from
/// `/cli/vm` with [token].
final class UiServer {
  UiServer._(this._server, this.root, this.token, this._open, this._plugins);

  static Future<UiServer> bind(
    int port, {
    required Directory root,
    required void Function(String url) open,
    List<String> plugins = const [],
  }) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, port);
    final random = Random.secure();
    final token = base64Url
        .encode(List.generate(24, (_) => random.nextInt(256)))
        .replaceAll('=', '');
    final ui = UiServer._(server, root, token, open, [
      for (final path in plugins) _Plugin(p.normalize(p.absolute(path))),
    ]);
    server.listen(ui._handle);
    for (final plugin in ui._plugins) {
      plugin.watch(ui._sendPlugins);
    }
    return ui;
  }

  final HttpServer _server;
  final Directory root;
  final String token;
  final void Function(String url) _open;
  final List<_Plugin> _plugins;
  final _clients = <HttpResponse>{};

  /// The last URL passed to [connect].
  String? vmUrl;

  int get port => _server.port;
  Uri get url => Uri.parse('http://127.0.0.1:$port/');

  /// Sends [vmUrl] to the open tabs, or opens one connected to it.
  void connect(String vmUrl) {
    this.vmUrl = vmUrl;
    if (_clients.isEmpty) {
      _open(connectLink(url, vmUrl));
    } else {
      _send({'connect': vmUrl});
    }
  }

  Future<void> close() async {
    for (final plugin in _plugins) {
      await plugin.cancel();
    }
    for (final client in _clients.toList()) {
      await client.close();
    }
    await _server.close(force: true);
  }

  void _send(Map<String, Object?> message) {
    final line = 'data: ${jsonEncode(message)}\n\n';
    for (final client in _clients) {
      client.write(line);
    }
  }

  void _sendPlugins() => _send(_pluginMessage());

  Map<String, Object?> _pluginMessage() => {
    'plugins': [
      for (final (i, p) in _plugins.indexed)
        'cli/plugins/$i/${p.name}?v=${p.revision}',
    ],
  };

  Future<void> _handle(HttpRequest request) async {
    final response = request.response
      ..headers.set('cache-control', 'no-store')
      ..headers.set('x-content-type-options', 'nosniff');
    try {
      // A page on another host name that resolves to 127.0.0.1 (DNS
      // rebinding) sends its own name.
      final host = request.headers.value('host');
      if (host != '127.0.0.1:$port' && host != 'localhost:$port') {
        return await _status(response, HttpStatus.forbidden);
      }
      final path = request.uri.path;
      if (path.startsWith('/cli/')) {
        return await _control(request, path.substring(5));
      }
      if (request.method != 'GET' && request.method != 'HEAD') {
        return await _status(response, HttpStatus.methodNotAllowed);
      }
      await _file(request);
    } catch (_) {
      await _status(response, HttpStatus.badRequest);
    }
  }

  Future<void> _control(HttpRequest request, String path) async {
    final response = request.response;
    if (path == 'events' && request.method == 'GET') {
      response
        ..bufferOutput = false
        ..headers.contentType = ContentType('text', 'event-stream')
        ..write('data: ${jsonEncode(_pluginMessage())}\n\n');
      _clients.add(response);
      unawaited(response.done.whenComplete(() => _clients.remove(response)));
      return;
    }
    if (path.split('/') case [
      'plugins',
      final index,
      final name,
    ] when request.method == 'GET') {
      final plugin = _plugins.elementAtOrNull(int.tryParse(index) ?? -1);
      if (plugin == null || plugin.name != name) {
        return _status(response, HttpStatus.notFound);
      }
      response
        ..headers.contentType = ContentType.parse(_types['js']!)
        ..add(plugin.read());
      return response.close();
    }
    if (request.headers.value(tokenHeader) != token) {
      return _status(response, HttpStatus.forbidden);
    }
    if (path == 'ping' && request.method == 'GET') {
      return _status(response, HttpStatus.noContent);
    }
    if (path == 'vm' && request.method == 'GET') {
      response
        ..headers.contentType = ContentType.json
        ..write(jsonEncode({'url': vmUrl}));
      return response.close();
    }
    if (path == 'connect' && request.method == 'POST') {
      final body = BytesBuilder(copy: false);
      await for (final chunk in request) {
        body.add(chunk);
        if (body.length > 65536) {
          return _status(response, HttpStatus.requestEntityTooLarge);
        }
      }
      final json = jsonDecode(utf8.decode(body.takeBytes()));
      final url = json is Map ? json['url'] : null;
      if (url is! String) return _status(response, HttpStatus.badRequest);
      connect(url);
      return _status(response, HttpStatus.noContent);
    }
    return _status(response, HttpStatus.notFound);
  }

  Future<void> _file(HttpRequest request) async {
    final response = request.response;
    final segments = request.uri.pathSegments;
    if (segments.any(
      (s) => s.startsWith('.') || s.contains('/') || s.contains(r'\'),
    )) {
      return _status(response, HttpStatus.notFound);
    }
    final path = request.uri.path;
    final relative = [...segments.where((s) => s.isNotEmpty)];
    Uri resolve() => root.uri.resolveUri(Uri(pathSegments: relative));
    if (path.endsWith('/')) {
      relative.add('index.html');
    } else if (Directory.fromUri(resolve()).existsSync()) {
      response.headers.set('location', '$path/');
      return _status(response, HttpStatus.movedPermanently);
    }
    final file = File.fromUri(resolve());
    final type = _types[relative.last.split('.').last];
    if (type == null || !file.existsSync()) {
      return _status(response, HttpStatus.notFound);
    }
    response.headers.contentType = ContentType.parse(type);
    if (request.method == 'HEAD') return response.close();
    if (relative.last == 'index.html') {
      // Tells the page to listen on /cli/events.
      response.write(
        (await file.readAsString()).replaceFirst(
          '<head>',
          '<head>\n    <meta name="devpul-cli" content="">',
        ),
      );
      return response.close();
    }
    await response.addStream(file.openRead());
    await response.close();
  }

  Future<void> _status(HttpResponse response, int status) async {
    response.statusCode = status;
    await response.close();
  }
}

/// A module file, or a plugin folder.
final class _Plugin {
  _Plugin(this.path) : folder = Directory(path).existsSync();

  final String path;
  final bool folder;
  int revision = 0;
  StreamSubscription<WatchEvent>? _watch;
  Timer? _debounce;

  String get name => folder ? '${p.basename(path)}.js' : p.basename(path);

  List<int> read() {
    if (!folder) return File(path).readAsBytesSync();
    final (:manifest, :files, :problems) = checkFolder(path);
    if (problems.isEmpty) {
      final source = module(manifest!, files);
      if (source != null) return utf8.encode(source);
    }
    final message = problems.isEmpty
        ? '$path has no source'
        : '$path: ${problems.join('; ')}';
    // Shows in Settings as the load error.
    return utf8.encode('throw new Error(${jsonEncode(message)});\n');
  }

  // FileWatcher follows a file that editors save by renaming a new one over
  // it.
  void watch(void Function() changed) {
    if (!folder && !File(path).existsSync()) return;
    final watcher = folder ? DirectoryWatcher(path) : FileWatcher(path);
    _watch = watcher.events.listen((event) {
      if (folder && inToolOutput(path, event.path)) return;
      _debounce?.cancel();
      _debounce = Timer(const Duration(milliseconds: 100), () {
        revision++;
        changed();
      });
    });
  }

  Future<void> cancel() async {
    _debounce?.cancel();
    await _watch?.cancel();
  }
}
