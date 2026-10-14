import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

import 'app.dart';
import 'check.dart';
import 'fetch.dart';
import 'manifest.dart';

typedef BuiltRegistry = ({
  String json,
  Map<String, String> readmes,
  List<String> problems,
});

/// Builds registry.json from the tagged plugins in [root]/plugins, listed
/// at [repo], the pointers in [root]/registry/third-party.json, each fetched
/// as `devpul add <id>` fetches it, and the pub packages in
/// [root]/registry/packages.json at their latest version. [local] lets
/// pointers use file and loopback URLs, for tests. [skipBroken] logs and
/// leaves out a pointer or package that fails to fetch or check, so one
/// upstream cannot block a deploy.
Future<BuiltRegistry> buildRegistry(
  String root, {
  required String repo,
  required Fetcher fetcher,
  bool local = false,
  bool skipBroken = false,
  void Function(String line)? log,
}) async {
  log ??= (_) {};
  final problems = <String>[];
  final entries = <String, Map<String, Object?>>{};
  final readmes = <String, String>{};

  Future<void> list(
    String id,
    String url,
    String? path,
    String fetchUrl,
  ) async {
    final fetched = await fetcher.listed(id, fetchUrl, path);
    if (fetched.manifest.unknown case final unknown when unknown.isNotEmpty) {
      throw PluginException(
        unknown.map((key) => 'plugin.json: $key: unknown field').join(', '),
      );
    }
    entries[id] = _entry(fetched, url, path);
    if (await fetcher.readme(fetched) case final readme?) readmes[id] = readme;
  }

  final firstParty = [
    for (final dir in Directory(p.join(root, 'plugins')).listSync())
      if (File(p.join(dir.path, 'plugin.json')).existsSync())
        p.basename(dir.path),
  ]..sort();
  for (final id in firstParty) {
    final path = 'plugins/$id';
    final checked = checkFolder(p.join(root, path));
    problems.addAll([
      for (final problem in checked.problems) '$path: $problem',
    ]);
    if (checked.manifest case final manifest? when manifest.id != id) {
      problems.add('$path: holds ${manifest.id}, not $id');
    }
    final tags = await Process.run('git', [
      '-C',
      root,
      'tag',
      '--list',
      '$id-v*',
    ]);
    if ((tags.stdout as String).trim().isEmpty) {
      log('$id: no $id-v<version> tags, not listed');
      continue;
    }
    try {
      await list(id, repo, path, Uri.file(root).toString());
    } on PluginException catch (e) {
      problems.add('$path: ${e.message}');
    }
  }

  List<Object?> read(String file) {
    try {
      final json = jsonDecode(File(p.join(root, file)).readAsStringSync());
      if (json is List<Object?>) return json;
      problems.add('$file: needs a list');
    } on FileSystemException catch (e) {
      problems.add('$file: ${e.message}');
    } on FormatException catch (e) {
      problems.add('$file: ${e.message}');
    }
    return const [];
  }

  const file = 'registry/third-party.json';
  final pointers = read(file);
  final ids = firstParty.toSet();
  for (final (i, pointer) in pointers.indexed) {
    final where = '$file #${i + 1}';
    if (pointer is! Map<String, Object?> ||
        pointer.keys.any((k) => !const {'id', 'url', 'path'}.contains(k))) {
      problems.add('$where: needs an object of id, url and path');
      continue;
    }
    final id = pointer['id'];
    final url = pointer['url'];
    final path = pointer['path'];
    if (id is! String || !isPluginId(id)) {
      problems.add('$where: id needs a plugin id');
      continue;
    }
    if (!ids.add(id)) {
      problems.add('$where: $id is already listed');
      continue;
    }
    final uri = url is String ? Uri.tryParse(url) : null;
    if (uri == null || !(uri.scheme == 'https' || local && _local(uri))) {
      problems.add('$where: url needs an https URL');
      continue;
    }
    if (path != null && (path is! String || !isPluginPath(path))) {
      problems.add('$where: path needs a relative / separated path');
      continue;
    }
    if (path != null && parseSource('$url') is UrlSource) {
      problems.add('$where: path is for git URLs');
      continue;
    }
    try {
      await list(id, '$url', path as String?, '$url');
    } on PluginException catch (e) {
      final problem = '$where: $id: ${e.message}';
      skipBroken ? log('$problem, not listed') : problems.add(problem);
    }
  }

  const packagesFile = 'registry/packages.json';
  for (final (i, entry) in read(packagesFile).indexed) {
    final where = '$packagesFile #${i + 1}';
    if (entry is! Map<String, Object?> ||
        entry.keys.any(
          (k) => !const {'id', 'package', 'tags', 'usage'}.contains(k),
        )) {
      problems.add('$where: needs an object of id, package, tags and usage');
      continue;
    }
    if (entry case {
      'id': final String id,
      'package': final String package,
      'tags': final List<Object?> tags,
      'usage': final List<Object?> usage,
    } when isPluginId(id) && isPackageName(package)) {
      if (tags.length > 5 || !tags.every((t) => t is String && isTag(t))) {
        problems.add('$where: tags needs up to 5 plugin tags');
        continue;
      }
      if (!usage.every((line) => line is String)) {
        problems.add('$where: usage needs a list of strings');
        continue;
      }
      if (!ids.add(id)) {
        problems.add('$where: $id is already listed');
        continue;
      }
      try {
        final latest = await fetcher.latestPackage(package);
        entries[id] = {
          'id': id,
          'version': '${latest.version}',
          'description': latest.description ?? '',
          'tags': tags,
          'usage': usage,
          'package': package,
          'url': 'https://pub.dev/packages/$package',
        };
      } on PluginException catch (e) {
        final problem = '$where: $package: ${e.message}';
        skipBroken ? log('$problem, not listed') : problems.add(problem);
      }
    } else {
      problems.add('$where: needs a plugin id and a package name');
    }
  }

  final registry = {
    'format': 1,
    'plugins': [for (final id in entries.keys.toList()..sort()) entries[id]],
  };
  return (
    json: '${const JsonEncoder.withIndent('  ').convert(registry)}\n',
    readmes: readmes,
    problems: problems,
  );
}

bool _local(Uri uri) =>
    uri.scheme == 'file' ||
    uri.scheme == 'http' &&
        (InternetAddress.tryParse(uri.host)?.isLoopback ?? false);

/// The manifest's fields, as written, that the UI and the marketplace read.
Map<String, Object?> _entry(Fetched fetched, String url, String? path) {
  final manifest = fetched.manifest;
  final json =
      jsonDecode(fetched.files['plugin.json']!) as Map<String, Object?>;
  return {
    'id': manifest.id,
    'version': '${manifest.version}',
    if (manifest.source != null) 'api': pluginApi,
    'devpul': json['devpul'],
    'description': manifest.description,
    'tags': manifest.tags,
    if (manifest.icon case final icon?) 'icon': fetched.files[icon]!.trim(),
    'usage': manifest.usage,
    'requires': json['requires'] ?? const <String, Object?>{},
    'url': url,
    'path': ?path,
  };
}
