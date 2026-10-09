import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';

import 'lock.dart';
import 'render.dart';

/// A plugin command failed; [message] says why and what to run.
final class PluginException implements Exception {
  PluginException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// The app or package that devpul vendors plugins into, at [root].
final class App {
  App._(this.root);

  /// Throws a [PluginException] when [dir] has no pubspec.yaml.
  factory App.open(String dir) {
    final root = p.absolute(dir);
    if (!File(p.join(root, 'pubspec.yaml')).existsSync()) {
      throw PluginException(
        'no pubspec.yaml in $root; run devpul in the app root',
      );
    }
    return App._(p.normalize(root));
  }

  final String root;

  File get _lockFile => File(p.join(root, 'devpul.lock'));
  File get generated => File(p.join(root, generatedFile));

  bool get hasLock => _lockFile.existsSync();

  /// An empty lock when there is no devpul.lock.
  Lock readLock() {
    if (!hasLock) return Lock({});
    try {
      return Lock.parse(_lockFile.readAsStringSync());
    } on FormatException catch (e) {
      throw PluginException(e.message);
    }
  }

  Directory pluginDir(String id) => Directory(p.join(root, pluginsDir, id));

  /// Every file in the plugin's folder by `/` separated path, or null when
  /// the folder is missing.
  Map<String, String>? vendored(String id) {
    final dir = pluginDir(id);
    if (!dir.existsSync()) return null;
    return {
      for (final file in dir.listSync(recursive: true).whereType<File>())
        p.posix.joinAll(p.split(p.relative(file.path, from: dir.path))):
            _readText(file),
    };
  }

  /// The files of every plugin in [lock].
  Map<String, Map<String, String>> allVendored(Lock lock) => {
    for (final id in lock.plugins.keys) id: ?vendored(id),
  };

  /// Renders [lock] with [vendored], then writes the vendored folders in
  /// [replace], the lock and the generated file. Nothing is written when
  /// render fails.
  void write(
    Lock lock,
    Map<String, Map<String, String>> vendored, {
    Map<String, Map<String, String>?> replace = const {},
  }) {
    final text = renderApp(lock, vendored);
    for (final MapEntry(key: id, value: files) in replace.entries) {
      final dir = pluginDir(id);
      if (dir.existsSync()) dir.deleteSync(recursive: true);
      for (final MapEntry(key: path, value: content) in (files ?? {}).entries) {
        File(p.joinAll([dir.path, ...p.posix.split(path)]))
          ..createSync(recursive: true)
          ..writeAsStringSync(content);
      }
    }
    _lockFile.writeAsStringSync(lock.encode());
    generated
      ..createSync(recursive: true)
      ..writeAsStringSync(text);
  }

  /// Ids whose folder no longer matches the lock hash.
  List<String> edited(Lock lock, Map<String, Map<String, String>> vendored) => [
    for (final MapEntry(key: id, value: entry) in lock.plugins.entries)
      if (vendored[id] case final files? when filesHash(files) != entry.hash)
        id,
  ];

  /// Throws a [PluginException] when there is no resolution to read.
  Packages packages() {
    for (var dir = root; ; dir = p.dirname(dir)) {
      final tool = p.join(dir, '.dart_tool');
      final config = File(p.join(tool, 'package_config.json'));
      final graph = File(p.join(tool, 'package_graph.json'));
      if (config.existsSync() && graph.existsSync()) {
        return Packages._read(root, config, graph);
      }
      if (p.dirname(dir) == dir) {
        throw PluginException(
          'no .dart_tool/package_graph.json for $root; run dart pub get '
          'or flutter pub get first',
        );
      }
    }
  }

  /// The `DevpulPlugins.install()` call is in a Dart file in lib or bin.
  bool get callsInstall {
    for (final name in ['lib', 'bin']) {
      final dir = Directory(p.join(root, name));
      if (!dir.existsSync()) continue;
      for (final file in dir.listSync(recursive: true).whereType<File>()) {
        if (file.path.endsWith('.dart') &&
            !p.isWithin(p.join(root, pluginsDir), file.path) &&
            file.readAsStringSync().contains('DevpulPlugins.install(')) {
          return true;
        }
      }
    }
    return false;
  }
}

/// [render], with its errors as [PluginException]s.
String renderApp(Lock lock, Map<String, Map<String, String>> vendored) {
  try {
    return render(lock, vendored);
  } on StateError catch (e) {
    throw PluginException(e.message);
  }
}

String _readText(File file) {
  try {
    return utf8.decode(file.readAsBytesSync());
  } on FormatException {
    throw PluginException('${file.path} is not UTF-8 text');
  }
}

/// The app's resolved packages, from the files `pub get` writes.
final class Packages {
  Packages._({
    required this.name,
    required this.dependencies,
    required this.versions,
  });

  factory Packages._read(String root, File config, File graph) {
    final configJson = jsonDecode(config.readAsStringSync());
    final graphJson = jsonDecode(graph.readAsStringSync());
    final base = config.parent.uri;
    String? name;
    if (configJson case {'packages': final List<Object?> packages}) {
      for (final package in packages) {
        if (package case {
          'name': final String n,
          'rootUri': final String uri,
        } when p.equals(p.fromUri(base.resolve(uri)), root)) {
          name = n;
        }
      }
    }
    final versions = <String, Version>{};
    var dependencies = <String>{};
    if (graphJson case {'packages': final List<Object?> packages}) {
      for (final package in packages) {
        if (package case {
          'name': final String n,
          'version': final String version,
        }) {
          versions[n] = Version.parse(version);
          if (n == name) {
            if (package['dependencies'] case final List<Object?> d) {
              dependencies = d.whereType<String>().toSet();
            }
          }
        }
      }
    }
    if (name == null) {
      throw PluginException(
        '${config.path} does not list $root; run dart pub get or flutter '
        'pub get',
      );
    }
    return Packages._(
      name: name,
      dependencies: dependencies,
      versions: versions,
    );
  }

  /// The app's package name.
  final String name;

  /// The app's direct dependencies.
  final Set<String> dependencies;

  /// Resolved versions by package.
  final Map<String, Version> versions;

  bool get flutter => dependencies.contains('flutter');
}
