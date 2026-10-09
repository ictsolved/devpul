import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';

import 'app.dart';
import 'fetch.dart';
import 'lock.dart';
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

  final devpul = packages.versions['devpul'];
  if (devpul == null || !packages.dependencies.contains('devpul')) {
    throw PluginException(
      'the app does not depend on devpul; run '
      '${packages.flutter ? 'flutter' : 'dart'} pub add devpul',
    );
  }
  if (!manifest.devpul.allows(devpul)) {
    throw PluginException(
      '$name needs devpul ${manifest.devpul}; the app has $devpul',
    );
  }
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

/// Stops unless the app depends on every package the plugin requires, at a
/// version it allows. Runs pub add only on [yes] or a yes answer.
Future<void> _requires(
  App app,
  Packages packages,
  Fetched fetched,
  Console console, {
  required bool yes,
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
    throw PluginException('nothing written; run $command, then add again');
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

/// Renders the generated file, or with [check] reports whether it is
/// current. Returns false when [check] finds it stale.
bool sync(App app, Console console, {bool check = false}) {
  if (!app.hasLock) throw PluginException('no devpul.lock in ${app.root}');
  final lock = app.readLock();
  final vendored = app.allVendored(lock);
  for (final id in app.edited(lock, vendored)) {
    console.err.writeln(
      '${p.relative(app.pluginDir(id).path, from: app.root)} differs from '
      'its devpul.lock hash.',
    );
  }
  final text = renderApp(lock, vendored);
  final current = app.generated.existsSync()
      ? app.generated.readAsStringSync()
      : null;
  if (check) {
    if (current == text) return true;
    console.err.writeln('$generatedFile is stale; run devpul sync.');
    return false;
  }
  if (current == text) {
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
