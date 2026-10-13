import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';

import 'app.dart';
import 'check.dart';
import 'create.dart' as template;
import 'fetch.dart';
import 'lock.dart';
import 'manifest.dart';
import 'registry.dart';
import 'render.dart';

/// Where a plugin command writes, and how it asks.
final class Console {
  Console({
    required this.out,
    required this.err,
    this.ask,
    this.pubAdd,
    this.page = false,
  });

  final StringSink out;
  final StringSink err;

  /// Diffs go to the terminal through git's pager, not to [out].
  final bool page;

  /// Asks a yes or no question; null when there is no terminal.
  final Future<bool> Function(String question)? ask;

  /// Runs `dart pub add` or `flutter pub add` in the app; returns the exit
  /// code.
  final Future<int> Function(String executable, List<String> args)? pubAdd;
}

Future<void> add(
  App app,
  Fetcher fetcher,
  Source source,
  Console console, {
  bool yes = false,
}) async {
  final packages = app.packages();
  if (source is RegistrySource) {
    fetcher.log = console.out.writeln;
    final entry = await fetcher.lookup(source.id);
    if (entry.package case final package?) {
      return _addPackage(packages, source, entry, package, console, yes: yes);
    }
  }
  final lock = app.readLock();
  final vendored = app.allVendored(lock);

  fetcher.log = console.out.writeln;
  final fetched = await fetcher.fetch(source);
  final manifest = fetched.manifest;
  final id = manifest.id;
  final name = '$id ${manifest.version}';
  _supports(packages, manifest);
  final dir = p.relative(app.pluginDir(id).path, from: app.root);
  if (lock.plugins[id] case final entry?) {
    if (vendored[id] case final files? when filesHash(files) != entry.hash) {
      throw PluginException(
        '$dir has edits that devpul.lock does not; run devpul remove $id '
        'to drop them',
      );
    }
  } else if (app.pluginDir(id).existsSync()) {
    throw PluginException('$dir exists and is not in devpul.lock');
  }

  console.out
    ..writeln('$name from ${describe(fetched.entry)}')
    ..writeln('  ${fetched.files.keys.join('  ')}')
    ..writeln('  hash ${fetched.entry.hash}');

  await _requires(app, packages, fetched, console, yes: yes);

  final next = Lock({...lock.plugins, id: fetched.entry});
  app.write(
    next,
    {...vendored, id: fetched.files},
    replace: {id: fetched.files},
  );
  console.out.writeln('Added $name to devpul.lock, $dir and $generatedFile.');
  _wiring(console, manifest.usage);
  if (!app.callsInstall) {
    console.out
      ..writeln('Call DevpulPlugins.install() in main:')
      ..writeln("  import 'package:${packages.name}/devpul/plugins.dart';")
      ..writeln('  DevpulPlugins.install();');
  }
}

/// Adds the pub package a registry entry lists, and devpul when the app
/// lacks it.
Future<void> _addPackage(
  Packages packages,
  RegistrySource source,
  RegistryEntry entry,
  String package,
  Console console, {
  required bool yes,
}) async {
  if (source.ref != null) {
    throw PluginException(
      '${source.id} is the pub package $package; #ref is for plugins',
    );
  }
  final add = [
    if (!packages.dependencies.contains('devpul')) 'devpul',
    if (!packages.dependencies.contains(package))
      [package, ?source.constraint].join(':'),
  ];
  if (add.isEmpty) {
    console.out.writeln('The app depends on $package.');
  } else {
    await _pubAdd(packages, console, add, yes: yes);
  }
  _wiring(console, entry.usage);
}

void _wiring(Console console, List<String> usage) {
  if (usage.isEmpty) return;
  console.out.writeln('Wiring:');
  for (final line in usage) {
    console.out.writeln('  $line');
  }
}

void _supports(Packages packages, Manifest manifest) {
  final devpul = packages.versions['devpul'];
  if (devpul == null || !packages.dependencies.contains('devpul')) {
    throw PluginException(
      'the app does not depend on devpul; run '
      '${packages.flutter ? 'flutter' : 'dart'} pub add devpul',
    );
  }
  if (!manifest.devpul.allows(devpul)) {
    throw PluginException(
      '${manifest.id} ${manifest.version} needs devpul ${manifest.devpul}; '
      'the app has $devpul',
    );
  }
}

/// Stops unless the app depends on every package the plugin requires, at a
/// version it allows. Runs pub add only on [yes] or a yes answer.
Future<void> _requires(
  App app,
  Packages packages,
  Fetched fetched,
  Console console, {
  required bool yes,
  String retry = 'add',
}) async {
  final manifest = fetched.manifest;
  final name = '${manifest.id} ${manifest.version}';
  if (manifest.requires.containsKey('flutter') && !packages.flutter) {
    throw PluginException('$name needs a Flutter app');
  }
  final add = <String, VersionConstraint>{};
  for (final MapEntry(key: package, value: constraint)
      in manifest.requires.entries) {
    if (package == 'flutter') continue;
    final version = packages.versions[package];
    if (!packages.dependencies.contains(package)) {
      console.err.writeln('$name needs $package $constraint.');
      add[package] = constraint;
    } else if (version == null || !constraint.allows(version)) {
      console.err.writeln(
        '$name needs $package $constraint; the app has $version.',
      );
      add[package] = constraint;
    }
  }
  if (add.isEmpty) return;
  await _pubAdd(
    packages,
    console,
    [for (final MapEntry(:key, :value) in add.entries) '$key:$value'],
    yes: yes,
    retry: retry,
  );
}

/// Runs pub add for [packages] on [yes] or a yes answer. [retry] is the
/// command that writes nothing until pub add has run.
Future<void> _pubAdd(
  Packages app,
  Console console,
  List<String> packages, {
  required bool yes,
  String? retry,
}) async {
  final executable = app.flutter ? 'flutter' : 'dart';
  final args = ['pub', 'add', ...packages];
  final command = [executable, ...args.map(_quote)].join(' ');
  final run =
      yes || (console.ask != null && await console.ask!('Run $command?'));
  if (!run || console.pubAdd == null) {
    throw PluginException(
      retry == null
          ? 'run $command'
          : 'nothing written; run $command, then $retry again',
    );
  }
  console.out.writeln(command);
  final code = await console.pubAdd!(executable, args);
  if (code != 0) {
    throw PluginException(
      retry == null ? '$command failed' : '$command failed; nothing written',
    );
  }
}

/// Prints each plugin's current, upgradable and latest version, then
/// devpul_cli's. Sources that fail show "can't check". Returns whether
/// anything is behind.
Future<bool> outdated(
  App app,
  Fetcher fetcher,
  Console console, {
  required Version cli,
}) async {
  final lock = app.readLock();
  final checks = [
    for (final MapEntry(key: id, value: entry) in lock.plugins.entries)
      _catch(fetcher.available(id, entry)),
  ];
  final latestCli = _catch(fetcher.latestCli());

  final rows = [
    ['Plugin', 'Current', 'Upgradable', 'Latest'],
  ];
  var behind = false;
  var upgradable = false;
  var latest = false;
  for (final (i, MapEntry(key: id, value: entry))
      in lock.plugins.entries.indexed) {
    String label(Version? version, String? commit) => [
      version?.toString() ?? '-',
      if (entry.ref != null && commit != null) commit.substring(0, 7),
    ].join(' ');
    final current = label(entry.version, entry.commit);
    switch (await checks[i]) {
      case (final available?, _):
        final up = available.upgradable;
        final moves =
            up != null &&
            (up != entry.version ||
                (available.commit != null && available.commit != entry.commit));
        upgradable |= moves;
        latest |= available.latest > (up ?? entry.version);
        behind |= moves || available.latest > entry.version;
        rows.add([
          id,
          current,
          label(up, available.commit),
          label(available.latest, available.commit),
        ]);
      case (_, final error):
        console.err.writeln('$id: $error');
        rows.add([id, current, '', "can't check"]);
    }
  }
  final (cliLatest, cliError) = await latestCli;
  if (cliError != null) console.err.writeln('devpul_cli: $cliError');
  final cliBehind = cliLatest != null && cliLatest > cli;
  rows.add(['devpul_cli', '$cli', '', cliLatest?.toString() ?? "can't check"]);

  final widths = [
    for (var i = 0; i < 3; i++)
      rows.map((row) => row[i].length).reduce((a, b) => a > b ? a : b),
  ];
  for (final row in rows) {
    console.out.writeln(
      [
        for (var i = 0; i < row.length; i++)
          i < 3 ? row[i].padRight(widths[i]) : row[i],
      ].join('  ').trimRight(),
    );
  }
  if (upgradable) {
    console.out.writeln('devpul upgrade takes the upgradable versions.');
  }
  if (latest) {
    console.out.writeln(
      'devpul upgrade --major-versions takes the latest, rewriting '
      'constraints.',
    );
  }
  if (cliBehind) console.out.writeln('devpul update updates devpul_cli.');
  return behind || cliBehind;
}

Future<(T?, String?)> _catch<T>(Future<T> future) async {
  try {
    return (await future, null);
  } on PluginException catch (e) {
    return (null, e.message);
  }
}

/// Moves plugins to the newest version their constraint allows, or with
/// [majorVersions] the newest overall, refs to their commit now, and URL and
/// folder plugins to what they serve now. Shows the diff and asks before
/// writing unless [yes].
Future<void> upgrade(
  App app,
  Fetcher fetcher,
  Console console, {
  String? id,
  bool majorVersions = false,
  bool yes = false,
}) async {
  final lock = app.readLock();
  if (id != null && !lock.plugins.containsKey(id)) {
    throw PluginException('$id is not in devpul.lock');
  }
  if (lock.plugins.isEmpty) {
    console.out.writeln('No plugins in devpul.lock.');
    return;
  }
  final ids = id == null ? lock.plugins.keys : [id];
  final vendored = app.allVendored(lock);
  final edited = app.edited(lock, vendored).toSet();
  String dir(String id) => p.relative(app.pluginDir(id).path, from: app.root);

  fetcher.log = console.out.writeln;
  final changed = <String, Fetched>{};
  for (final id in ids) {
    final entry = lock.plugins[id]!;
    final fetched = await fetcher.refetch(
      id,
      entry,
      majorVersions: majorVersions,
    );
    if (fetched.manifest.id != id) {
      throw PluginException(
        '${describe(entry)} holds ${fetched.manifest.id}, not $id',
      );
    }
    if (jsonEncode(fetched.entry.toJson()) == jsonEncode(entry.toJson()) &&
        vendored.containsKey(id)) {
      console.out.writeln('$id ${_version(entry)} is up to date.');
      continue;
    }
    if (edited.contains(id)) {
      throw PluginException(
        '${dir(id)} has edits that devpul.lock does not; '
        '${isFolder(entry.url) ? 'make them in ${entry.url}, or ' : ''}'
        'run devpul remove $id to drop them',
      );
    }
    changed[id] = fetched;
  }
  if (changed.isEmpty) return;

  final packages = app.packages();
  for (final MapEntry(key: id, value: fetched) in changed.entries) {
    _supports(packages, fetched.manifest);
    final from = lock.plugins[id]!;
    final to = fetched.entry;
    console.out.writeln(
      [
        '$id ${_version(from)} to ${_version(to)}',
        if ('${from.constraint}' != '${to.constraint}')
          'constraint ${from.constraint} to ${to.constraint}',
      ].join(', '),
    );
  }

  if (!yes) {
    await _diff(vendored, changed, console);
    final command = [
      'devpul upgrade',
      ?id,
      if (majorVersions) '--major-versions',
      '--yes',
    ].join(' ');
    if (console.ask == null) {
      throw PluginException('nothing written; run $command to write it');
    }
    if (!await console.ask!('Write these changes?')) {
      console.out.writeln('Nothing written.');
      return;
    }
  }
  for (final fetched in changed.values) {
    await _requires(
      app,
      packages,
      fetched,
      console,
      yes: yes,
      retry: 'upgrade',
    );
  }

  final files = {
    for (final MapEntry(key: id, value: fetched) in changed.entries)
      id: fetched.files,
  };
  app.write(
    Lock({
      ...lock.plugins,
      for (final MapEntry(key: id, value: fetched) in changed.entries)
        id: fetched.entry,
    }),
    {...vendored, ...files},
    replace: files,
  );
  console.out.writeln(
    'Wrote ${changed.keys.map(dir).join(', ')}, devpul.lock and '
    '$generatedFile.',
  );
  for (final MapEntry(key: id, value: fetched) in changed.entries) {
    final usage = fetched.manifest.usage;
    if (usage.isEmpty || _usage(vendored[id]).join('\n') == usage.join('\n')) {
      continue;
    }
    console.out.writeln('$id wiring:');
    for (final line in usage) {
      console.out.writeln('  $line');
    }
  }
}

String _version(LockEntry entry) => [
  '${entry.version}',
  if (entry.ref != null && entry.commit != null) entry.commit!.substring(0, 7),
].join(' ');

/// The `usage` of a vendored plugin.json, empty when it cannot be read.
List<String> _usage(Map<String, String>? files) {
  try {
    if (jsonDecode(files?['plugin.json'] ?? '') case {
      'usage': final List<Object?> usage,
    }) {
      return usage.whereType<String>().toList();
    }
  } on FormatException {
    // Empty.
  }
  return const [];
}

/// Shows `git diff` between the vendored and fetched files, each under
/// its path in the app.
Future<void> _diff(
  Map<String, Map<String, String>> vendored,
  Map<String, Fetched> changed,
  Console console,
) async {
  final temp = Directory.systemTemp.createTempSync('devpul_upgrade');
  try {
    for (final side in ['a', 'b']) {
      Directory(p.join(temp.path, side)).createSync();
      for (final id in changed.keys) {
        final files = side == 'a' ? vendored[id] : changed[id]!.files;
        for (final MapEntry(key: path, value: content)
            in (files ?? {}).entries) {
          File(
              p.joinAll([
                temp.path,
                side,
                pluginsDir,
                id,
                ...p.posix.split(path),
              ]),
            )
            ..createSync(recursive: true)
            ..writeAsStringSync(content);
        }
      }
    }
    final args = [
      if (!console.page) ...['--no-pager', '-c', 'color.ui=never'],
      'diff',
      '--no-index',
      '--no-prefix',
      '--',
      'a',
      'b',
    ];
    final int code;
    try {
      if (console.page) {
        final process = await Process.start(
          'git',
          args,
          workingDirectory: temp.path,
          mode: ProcessStartMode.inheritStdio,
        );
        code = await process.exitCode;
      } else {
        final result = await Process.run(
          'git',
          args,
          workingDirectory: temp.path,
        );
        console.out.write(result.stdout);
        code = result.exitCode;
      }
    } on ProcessException {
      throw PluginException('the diff needs git on PATH; --yes skips it');
    }
    if (code > 1) throw PluginException('git diff failed with exit $code');
  } finally {
    temp.deleteSync(recursive: true);
  }
}

String _quote(String arg) =>
    RegExp(r'^[\w:./=-]+$').hasMatch(arg) ? arg : "'$arg'";

void remove(App app, String id, Console console) {
  final lock = app.readLock();
  if (!lock.plugins.containsKey(id)) {
    throw PluginException('$id is not in devpul.lock');
  }
  final next = Lock({...lock.plugins}..remove(id));
  app.write(next, app.allVendored(next), replace: {id: null});
  console.out.writeln(
    'Removed $id from devpul.lock, '
    '${p.relative(app.pluginDir(id).path, from: app.root)} and '
    '$generatedFile.',
  );
}

void list(App app, Console console) {
  final lock = app.readLock();
  if (lock.plugins.isEmpty) {
    console.out.writeln('No plugins in devpul.lock.');
    return;
  }
  final vendored = app.allVendored(lock);
  final edited = app.edited(lock, vendored).toSet();
  final rows = [
    for (final MapEntry(key: id, value: entry) in lock.plugins.entries)
      [
        id,
        '${entry.version}',
        '${entry.constraint ?? ''}',
        describe(entry),
        if (!vendored.containsKey(id))
          'missing'
        else if (edited.contains(id))
          'edited',
      ],
  ];
  final widths = [
    for (var i = 0; i < 3; i++)
      rows.map((row) => row[i].length).reduce((a, b) => a > b ? a : b),
  ];
  for (final row in rows) {
    console.out.writeln(
      [
        for (var i = 0; i < row.length; i++)
          i < 3 ? row[i].padRight(widths[i]) : row[i],
      ].join('  ').trimRight(),
    );
  }
}

/// Copies plugins added from a folder again where the folder changed, then
/// renders the generated file. With [check] it writes nothing and returns
/// false when either is stale.
Future<bool> sync(App app, Console console, {bool check = false}) async {
  if (!app.hasLock) throw PluginException('no devpul.lock in ${app.root}');
  final lock = app.readLock();
  final vendored = app.allVendored(lock);
  final edited = app.edited(lock, vendored).toSet();
  String dir(String id) => p.relative(app.pluginDir(id).path, from: app.root);

  final changed = <String, Fetched>{};
  for (final MapEntry(key: id, value: entry) in lock.plugins.entries) {
    if (!isFolder(entry.url)) continue;
    final fetched = await fetchFolder(app.root, entry.url);
    if (fetched.manifest.id != id) {
      throw PluginException(
        '${entry.url} holds ${fetched.manifest.id}, not $id',
      );
    }
    if (edited.contains(id) && !check) {
      throw PluginException(
        '${dir(id)} has edits that devpul.lock does not; make them in '
        '${entry.url}, or run devpul remove $id to drop them',
      );
    }
    if (fetched.entry.hash != entry.hash ||
        !vendored.containsKey(id) ||
        edited.contains(id)) {
      changed[id] = fetched;
    }
  }
  for (final id in edited) {
    if (!changed.containsKey(id)) {
      console.err.writeln('${dir(id)} differs from its devpul.lock hash.');
    }
  }

  if (check) {
    for (final MapEntry(key: id, value: fetched) in changed.entries) {
      console.err.writeln(
        '${dir(id)} differs from ${fetched.entry.url}; run devpul sync.',
      );
    }
    final current = app.generated.existsSync()
        ? app.generated.readAsStringSync()
        : null;
    if (current == renderApp(lock, vendored)) return changed.isEmpty;
    console.err.writeln('$generatedFile is stale; run devpul sync.');
    return false;
  }

  if (changed.isNotEmpty) {
    final packages = app.packages();
    for (final fetched in changed.values) {
      _supports(packages, fetched.manifest);
      await _requires(
        app,
        packages,
        fetched,
        console,
        yes: false,
        retry: 'sync',
      );
    }
    final files = {
      for (final MapEntry(key: id, value: fetched) in changed.entries)
        id: fetched.files,
    };
    app.write(
      Lock({
        ...lock.plugins,
        for (final MapEntry(key: id, value: fetched) in changed.entries)
          id: fetched.entry,
      }),
      {...vendored, ...files},
      replace: files,
    );
    for (final MapEntry(key: id, value: fetched) in changed.entries) {
      console.out.writeln(
        'Copied $id ${fetched.manifest.version} from ${fetched.entry.url} '
        'to ${dir(id)}.',
      );
    }
    console.out.writeln('Wrote devpul.lock and $generatedFile.');
    return true;
  }

  final text = renderApp(lock, vendored);
  if (app.generated.existsSync() && app.generated.readAsStringSync() == text) {
    console.out.writeln('$generatedFile is up to date.');
  } else {
    app.generated
      ..createSync(recursive: true)
      ..writeAsStringSync(text);
    console.out.writeln('Wrote $generatedFile.');
  }
  return true;
}

void cacheClean(String cache, Console console) {
  final dir = Directory(p.join(cache, 'git'));
  if (!dir.existsSync()) {
    console.out.writeln('Nothing cached.');
    return;
  }
  dir.deleteSync(recursive: true);
  console.out.writeln('Removed ${dir.path}.');
}

/// The source of [entry] as one line.
String describe(LockEntry entry) => [
  entry.url,
  ?entry.path,
  if (entry.ref case final ref?) '#$ref',
  if (entry.commit case final commit?) 'at ${commit.substring(0, 7)}',
].join(' ');

void create(
  String dir,
  Console console, {
  required bool js,
  required bool dart,
  required Version devpul,
}) {
  final written = template.create(dir, js: js, dart: dart, devpul: devpul);
  if (written.isEmpty) {
    console.out.writeln('Nothing to write in $dir.');
    return;
  }
  final module = checkFolder(dir).manifest?.source != null;
  console.out
    ..writeln('Wrote ${written.join(', ')} in $dir.')
    ..writeln(
      'Run it:    cd $dir && dart pub get && '
      'devpul ${module ? '--plugin . ' : ''}run example/main.dart',
    )
    ..writeln('Check it:  devpul check $dir')
    ..writeln('In an app: devpul add <path to $dir>');
}

/// Prints every problem with the plugin folder [dir]; false when there are
/// any.
bool check(String dir, Console console) {
  final (:manifest, files: _, :problems) = checkFolder(dir);
  if (problems.isEmpty) {
    console.out.writeln('${manifest!.id} ${manifest.version} passes.');
    return true;
  }
  for (final problem in problems) {
    console.err.writeln(problem);
  }
  return false;
}
