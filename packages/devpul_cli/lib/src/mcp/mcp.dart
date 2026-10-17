import 'dart:async';
import 'dart:io';

import 'package:dart_mcp/stdio.dart';

import '../instance.dart';
import 'events.dart';
import 'store.dart';
import 'tools.dart';
import 'vm.dart';

/// Serves MCP on stdio until the client closes it. Reads the session
/// [file], the app at [vmUrl], or the one the devpul serving the UI on
/// [port] last connected to, asked again on every tool call.
Future<void> serveMcp({
  required String version,
  required int port,
  String? vmUrl,
  String? file,
}) async {
  final store = Store();
  if (file != null) store.add(fromSession(await File(file).readAsString()));
  final app = AppConnection(
    store,
    vmUrl != null
        ? () async => vmUrl
        : () async => (await RemoteServer.find(port))?.vmUrl(),
    file: file,
  );
  final server = DevpulMcp(
    stdioChannel(input: stdin, output: stdout),
    app,
    version: version,
  );
  // Live events from the start, beyond what the app's backlog holds.
  unawaited(app.ensure().catchError((_) {}));
  await server.done;
  await app.close();
}
