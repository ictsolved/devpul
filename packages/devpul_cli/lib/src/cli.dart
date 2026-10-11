import 'dart:async';
import 'dart:io';
import 'dart:isolate';

import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';

import 'cache.dart';
import 'instance.dart';
import 'plugins/app.dart';
import 'plugins/commands.dart' as plugins;
import 'plugins/fetch.dart';
import 'run.dart';
import 'server.dart';

const usage = '''
Usage: devpul [options] [vm-service-url]
       devpul [options] run [flutter run or dart run arguments]
       devpul add <plugin>[@version|#ref] [--path <dir>] [--yes]
       devpul remove <id>
       devpul list
       devpul sync [--check]
       devpul outdated [--exit-code]
       devpul upgrade [id] [--major-versions] [--yes]
       devpul update
       devpul cache clean
       devpul create <dir> [--js] [--dart]
       devpul check [dir]

Serves the DevPul UI on 127.0.0.1 and opens it, connected to the app when a
VM service URL is given. run starts flutter run, or dart run outside a
Flutter project, and connects the UI once the app is up; a dart run app hot
reloads when a .dart file is saved. run --profile keeps DevPul in the profile
build. A devpul that finds another one on its port hands the app to that
one's tab.

Options:
  --port <n>       UI port, default 7171. Settings and history are kept per port.
  --no-open        print links instead of opening a browser
  --plugin <path>  serve a plugin module or folder to the UI, reloaded on save
  -h, --help       show this help

Plugins, run in the app root:
  add          copy a plugin into lib/devpul/<id>/, record it in devpul.lock
               and write lib/devpul/plugins.dart. <plugin> is a registry
               name, a git URL, a plugin.json URL or a folder. @version takes
               a pub version constraint, #ref a git branch, tag or commit.
    --path     the plugin folder in a git repository
    --yes      run the pub add a plugin needs without asking
  remove       delete a plugin's folder and lock entry
  list         plugins in devpul.lock
  sync         write lib/devpul/plugins.dart from devpul.lock, offline.
               Copies plugins added from a folder again when it changed.
    --check    exit 1 when either is stale instead
  outdated     plugin versions: current, upgradable within the constraint,
               latest. Also lists devpul_cli against pub.dev.
    --exit-code  exit 1 when anything is behind
  upgrade      move one plugin, or all, to the upgradable version, then
               write lib/devpul/plugins.dart. Shows the diff and asks
               first. Refs move to their commit, folders and plugin.json
               URLs to what they hold now.
    --major-versions  take the latest version, rewriting the
                      constraint when it does not allow it
    --yes      write without the diff and run the pub add a plugin needs
  update       update devpul: dart pub global activate devpul_cli
  cache clean  delete the git mirrors devpul keeps

Plugin authoring:
  create       write a plugin folder named after the plugin id, or the
               files missing from one. A new plugin gets both halves unless
               one is picked; an existing one gets the picked half added.
    --js       a JS module for a tab
    --dart     Dart for the app, such as an observer
  check        validate a plugin folder the way add and the registry do
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

const _pluginCommands = {
  'add',
  'remove',
  'list',
  'sync',
  'outdated',
  'upgrade',
  'update',
  'cache',
  'create',
  'check',
};

/// The parsed arguments of a plugin command.
typedef PluginArgs = ({
  String command,
  List<String> rest,
  Set<String> flags,
  Map<String, String> options,
});

/// Throws a [FormatException] for a usage error.
PluginArgs parsePluginArgs(List<String> args) {
  final [command, ...tail] = args;
  final (flags, options, count) = switch (command) {
    'add' => ({'--yes'}, {'--path'}, 1),
    'sync' => ({'--check'}, <String>{}, 0),
    'outdated' => ({'--exit-code'}, <String>{}, 0),
    'upgrade' => ({'--major-versions', '--yes'}, <String>{}, 1),
    'remove' => (<String>{}, <String>{}, 1),
    'cache' => (<String>{}, <String>{}, 1),
    'create' => ({'--js', '--dart'}, <String>{}, 1),
    'check' => (<String>{}, <String>{}, 1),
    _ => (<String>{}, <String>{}, 0),
  };
  final rest = <String>[];
  final setFlags = <String>{};
  final setOptions = <String, String>{};
  for (var i = 0; i < tail.length; i++) {
    final [name, ...inline] = tail[i].split('=');
    if (flags.contains(name) && inline.isEmpty) {
      setFlags.add(name);
    } else if (options.contains(name)) {
      if (inline.isEmpty && i + 1 >= tail.length) {
        throw FormatException('$name needs a value');
      }
      setOptions[name] = inline.isNotEmpty ? inline.join('=') : tail[++i];
    } else if (tail[i].startsWith('-')) {
      throw FormatException('unknown option ${tail[i]} for $command');
    } else {
      rest.add(tail[i]);
    }
  }
  if (command == 'check' && rest.isEmpty) rest.add('.');
  if (rest.length != count && !(command == 'upgrade' && rest.isEmpty)) {
    throw FormatException(switch (count) {
      0 => '$command takes no arguments',
      _ when rest.isEmpty => '$command needs an argument',
      _ => 'unexpected argument ${rest[1]}',
    });
  }
  if (command == 'cache' && rest.single != 'clean') {
    throw FormatException('unknown cache command ${rest.single}');
  }
  return (command: command, rest: rest, flags: setFlags, options: setOptions);
}

Future<int> _plugins(List<String> args) async {
  final PluginArgs parsed;
  final Source? source;
  try {
    parsed = parsePluginArgs(args);
    source = parsed.command == 'add'
        ? parseSource(parsed.rest.single, path: parsed.options['--path'])
        : null;
  } on FormatException catch (e) {
    stderr.writeln('devpul: ${e.message}\n\n$usage');
    return 64;
  }
  final terminal = stdin.hasTerminal && stdout.hasTerminal;
  final console = plugins.Console(
    out: stdout,
    err: stderr,
    ask: terminal ? _ask : null,
    page: terminal,
    pubAdd: (executable, args) async {
      final process = await Process.start(
        executable,
        args,
        mode: ProcessStartMode.inheritStdio,
        runInShell: Platform.isWindows,
      );
      return process.exitCode;
    },
  );
  try {
    switch (parsed.command) {
      case 'cache':
        plugins.cacheClean(cacheDir(), console);
        return 0;
      case 'create':
        final version = await devpulVersion();
        plugins.create(
          parsed.rest.single,
          console,
          js: parsed.flags.contains('--js'),
          dart: parsed.flags.contains('--dart'),
          devpul: version,
        );
        return 0;
      case 'check':
        return plugins.check(parsed.rest.single, console) ? 0 : 1;
      case 'update':
        // The SDK running devpul is the one whose pub cache holds it.
        final process = await Process.start(Platform.resolvedExecutable, [
          'pub',
          'global',
          'activate',
          'devpul_cli',
        ], mode: ProcessStartMode.inheritStdio);
        return await process.exitCode;
    }
    final app = App.open(Directory.current.path);
    switch (parsed.command) {
      case 'add':
        await plugins.add(
          app,
          Fetcher(root: app.root, cache: cacheDir()),
          source!,
          console,
          yes: parsed.flags.contains('--yes'),
        );
      case 'remove':
        plugins.remove(app, parsed.rest.single, console);
      case 'list':
        plugins.list(app, console);
      case 'sync':
        final check = parsed.flags.contains('--check');
        if (!await plugins.sync(app, console, check: check)) return 1;
      case 'outdated':
        final behind = await plugins.outdated(
          app,
          Fetcher(root: app.root, cache: cacheDir()),
          console,
          cli: await devpulVersion(),
        );
        if (behind && parsed.flags.contains('--exit-code')) return 1;
      case 'upgrade':
        await plugins.upgrade(
          app,
          Fetcher(root: app.root, cache: cacheDir()),
          console,
          id: parsed.rest.firstOrNull,
          majorVersions: parsed.flags.contains('--major-versions'),
          yes: parsed.flags.contains('--yes'),
        );
    }
    return 0;
  } on PluginException catch (e) {
    stderr.writeln('devpul: ${e.message}');
    return 1;
  }
}

Future<bool> _ask(String question) async {
  stdout.write('$question [y/N] ');
  final answer = stdin.readLineSync()?.trim().toLowerCase();
  return answer == 'y' || answer == 'yes';
}

Future<int> runCli(List<String> args) async {
  if (args.isNotEmpty && _pluginCommands.contains(args.first)) {
    return _plugins(args);
  }
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
    if (!File(path).existsSync() &&
        !File(p.join(path, 'plugin.json')).existsSync()) {
      stderr.writeln('devpul: no plugin file or folder at $path');
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

/// The version of the devpul package this CLI runs with.
Future<Version> devpulVersion() async {
  final lib = await Isolate.resolvePackageUri(
    Uri.parse('package:devpul/devpul.dart'),
  );
  final pubspec = lib == null
      ? null
      : File.fromUri(lib.resolve('../pubspec.yaml'));
  final match = pubspec != null && pubspec.existsSync()
      ? RegExp(
          r'^version:\s*(\S+)',
          multiLine: true,
        ).firstMatch(pubspec.readAsStringSync())
      : null;
  if (match == null) {
    throw PluginException('cannot read the devpul package version');
  }
  return Version.parse(match[1]!);
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
        plugins: options.plugins,
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
