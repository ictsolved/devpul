import 'dart:convert';
import 'dart:io';

import 'cache.dart';
import 'server.dart';

/// Records the port and token of a serving devpul, so a later one on the same
/// port can hand it a URL.
File stateFile(int port) => File('${cacheDir()}/server-$port.json');

void writeState(UiServer server) {
  final file = stateFile(server.port);
  if (!file.parent.existsSync()) {
    file.parent.createSync(recursive: true);
    if (!Platform.isWindows) {
      Process.runSync('chmod', ['700', file.parent.path]);
    }
  }
  file.writeAsStringSync(
    jsonEncode({'port': server.port, 'token': server.token}),
  );
}

void deleteState(int port) {
  try {
    stateFile(port).deleteSync();
  } on FileSystemException {
    // Already gone.
  }
}

/// A devpul that another process serves on [port].
final class RemoteServer {
  RemoteServer._(this.port, this._token);

  final int port;
  final String _token;

  Uri get url => Uri.parse('http://127.0.0.1:$port/');

  /// The devpul on [port], if that is what listens there.
  static Future<RemoteServer?> find(int port) async {
    try {
      final state = jsonDecode(stateFile(port).readAsStringSync());
      if (state is! Map || state['token'] is! String) return null;
      final remote = RemoteServer._(port, state['token'] as String);
      return await remote._request('GET', 'ping') ? remote : null;
    } on Exception {
      return null;
    }
  }

  Future<void> connect(String vmUrl) async {
    if (!await _request('POST', 'connect', {'url': vmUrl})) {
      stderr.writeln('devpul: the devpul on port $port did not take $vmUrl');
    }
  }

  Future<bool> _request(String method, String path, [Object? body]) async {
    final client = HttpClient();
    try {
      final request = await client.openUrl(method, url.resolve('cli/$path'));
      request.headers.set(tokenHeader, _token);
      if (body != null) request.write(jsonEncode(body));
      final response = await request.close();
      await response.drain<void>();
      return response.statusCode == HttpStatus.noContent;
    } on IOException {
      return false;
    } finally {
      client.close();
    }
  }
}
