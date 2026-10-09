import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';

import 'app.dart';
import 'check.dart';
import 'create.dart' as template;
import 'fetch.dart';
import 'lock.dart';
import 'manifest.dart';
import 'render.dart';

/// Where a plugin command writes, and how it asks.
final class Console {
  Console({required this.out, required this.err, this.ask, this.pubAdd});

  final StringSink out;
  final StringSink err;

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
  if (manifest.usage.isNotEmpty) {
    console.out.writeln('Wiring:');
    for (final line in manifest.usage) {
      console.out.writeln('  $line');
    }
  }
  if (!app.callsInstall) {
    console.out
      ..writeln('Call DevpulPlugins.install() in main:')
      ..writeln("  import 'package:${packages.name}/devpul/plugins.dart';")
      ..writeln('  DevpulPlugins.install();');
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

  final executable = packages.flutter ? 'flutter' : 'dart';
  final args = [
    'pub',
    'add',
    for (final MapEntry(:key, :value) in add.entries) '$key:$value',
  ];
  final command = [executable, ...args.map(_quote)].join(' ');
  final run =
      yes || (console.ask != null && await console.ask!('Run $command?'));
  if (!run || console.pubAdd == null) {
    throw PluginException('nothing written; run $command, then $retry again');
  }
  console.out.writeln(command);
  final code = await console.pubAdd!(executable, args);
  if (code != 0) {
    throw PluginException('$command failed; nothing written');
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
