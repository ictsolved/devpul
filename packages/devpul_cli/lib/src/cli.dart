import 'dart:async';
import 'dart:io';
import 'dart:isolate';

import 'instance.dart';
import 'run.dart';
import 'server.dart';

const usage = '''
Usage: devpul [options] [vm-service-url]
       devpul [options] run [flutter run or dart run arguments]

Serves the DevPul UI on 127.0.0.1 and opens it, connected to the app when a
VM service URL is given. run starts flutter run, or dart run outside a
Flutter project, and connects the UI once the app is up. A devpul that finds
another one on its port hands the app to that one's tab.

Options:
  --port <n>       UI port, default 7171. Settings and history are kept per port.
  --no-open        print links instead of opening a browser
  --plugin <file>  serve a plugin module to the UI and reload it on save
  -h, --help       show this help
''';

const defaultPort = 7171;

final class Options {
  int? port;
  bool open = true;
  bool help = false;
  final plugins = <String>[];
  bool run = false;

  /// The VM service URL, or the arguments for run.
  final rest = <String>[];
}

/// Throws a [FormatException] for a usage error.
Options parseArgs(List<String> args) {
  final options = Options();
  String value(int i, String name) {
    if (i >= args.length) throw FormatException('$name needs a value');
    return args[i];
  }

  for (var i = 0; i < args.length; i++) {
    final arg = args[i];
    final [name, ...inline] = arg.split('=');
    String next() => inline.isNotEmpty ? inline.join('=') : value(++i, name);
    switch (name) {
      case '--port':
        final text = next();
        final port = int.tryParse(text);
        if (port == null || port < 0 || port > 65535) {
          throw FormatException(
            '--port needs a number from 0 to 65535, not $text',
          );
        }
        options.port = port;
      case '--plugin':
        options.plugins.add(next());
      case '--no-open':
        options.open = false;
      case '-h' || '--help':
        options.help = true;
      case 'run':
        options
          ..run = true
          ..rest.addAll(args.skip(i + 1));
        return options;
      case _ when arg.startsWith('-'):
        throw FormatException('unknown option $arg');
      case _ when options.rest.isNotEmpty:
        throw FormatException('unexpected argument $arg');
      case _:
        options.rest.add(arg);
    }
  }
  return options;
}

Future<int> runCli(List<String> args) async {
  final Options options;
  try {
    options = parseArgs(args);
  } on FormatException catch (e) {
    stderr.writeln('devpul: ${e.message}\n\n$usage');
    return 64;
  }
  if (options.help) {
    stdout.write(usage);
    return 0;
  }
  final root = await uiRoot();
  if (root == null) {
    stderr.writeln(
      'devpul: the UI build is missing from the devpul package. In the '
      'DevPul repository, run npm run build:extension.',
    );
    return 1;
  }
  for (final path in options.plugins) {
    if (!File(path).existsSync()) {
      stderr.writeln('devpul: no plugin file at $path');
      return 1;
    }
  }
  final ui = await _startUi(options, root);
  if (ui == null) return 1;

  if (options.run) {
    final code = await runApp(options.rest, ui: ui.url, connect: ui.connect);
    await ui.close();
    return code;
  }
  if (options.rest case [final vmUrl]) {
    await ui.connect(vmUrl);
  } else {
    await _open(ui.url.toString(), options.open);
  }
  if (!ui.serving) return 0;
  await _interrupted();
  await ui.close();
  return 0;
}

/// The UI build that ships in the devpul package. Null in a compiled
/// executable, which has no package config.
Future<Directory?> uiRoot() async {
  final lib = await Isolate.resolvePackageUri(
    Uri.parse('package:devpul/devpul.dart'),
  );
  if (lib == null) return null;
  final dir = Directory.fromUri(lib.resolve('../extension/devtools/build/'));
  return File.fromUri(dir.uri.resolve('index.html')).existsSync() ? dir : null;
}

final class _Ui {
  _Ui(this.url, this.connect, this.close, {required this.serving});

  final Uri url;
  final Future<void> Function(String vmUrl) connect;
  final Future<void> Function() close;
  final bool serving;
}

/// Serves on the port, or hands over to the devpul already there. Without
/// --port, a port taken by something else moves to the next one.
Future<_Ui?> _startUi(Options options, Directory root) async {
  final first = options.port ?? defaultPort;
  for (var port = first; port < first + 20; port++) {
    try {
      final server = await UiServer.bind(
        port,
        root: root,
        open: (url) => unawaited(_open(url, options.open)),
        plugins: [for (final path in options.plugins) File(path)],
      );
      writeState(server);
      stdout.writeln('DevPul UI at ${server.url}');
      return _Ui(server.url, (url) async => server.connect(url), () async {
        deleteState(server.port);
        await server.close();
      }, serving: true);
    } on SocketException {
      final remote = await RemoteServer.find(port);
      if (remote != null) {
        if (options.plugins.isNotEmpty) {
          stderr.writeln(
            'devpul: another devpul serves port $port, and --plugin needs '
            'its own. Stop that one or pass --port.',
          );
          return null;
        }
        stdout.writeln('DevPul UI at ${remote.url}, served by another devpul');
        return _Ui(remote.url, remote.connect, () async {}, serving: false);
      }
      if (options.port != null) {
        stderr.writeln('devpul: port $port is in use');
        return null;
      }
    }
  }
  stderr.writeln('devpul: ports $first to ${first + 19} are in use');
  return null;
}

Future<void> _open(String url, bool open) async {
  if (open) {
    final (command, args) = Platform.isMacOS
        ? ('open', [url])
        : Platform.isWindows
        ? ('cmd', ['/c', 'start', '', url])
        : ('xdg-open', [url]);
    try {
      await Process.start(command, args, mode: ProcessStartMode.detached);
      return;
    } on ProcessException {
      // Printed below.
    }
  }
  stdout.writeln('DevPul $url');
}

Future<void> _interrupted() {
  final done = Completer<void>();
  final signals = [
    ProcessSignal.sigint,
    if (!Platform.isWindows) ProcessSignal.sigterm,
  ];
  for (final signal in signals) {
    signal.watch().listen((_) {
      if (!done.isCompleted) done.complete();
    });
  }
  return done.future;
}
