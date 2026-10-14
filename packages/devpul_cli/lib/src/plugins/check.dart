import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;

import 'manifest.dart';
import 'render.dart';

/// Largest module the UI loads, in bytes, icon included.
const maxSource = 512 * 1024;

final _svg = RegExp(r'^(<\?xml[^>]*\?>\s*)?<svg[\s>]');
final _default = RegExp(r'\bexport\s+default\b');
final _exportList = RegExp(r'\bexport\s*\{([^}]*)\}');
final _exportIcon = RegExp(
  r'\bexport\s+(?:const|let|var|class|(?:async\s+)?function\*?)\s+icon\b',
);
final _import = RegExp(
  r'''^\s*(?:import\s*[\w*{'"]|export\s[^;]*\bfrom\s*['"])''',
  multiLine: true,
);
final _directive = RegExp(
  r'''^\s*(?:import|export|part)\s+['"]([^'"]+)['"]''',
  multiLine: true,
);

/// Problems with the files of a parsed plugin, which [files] holds by path
/// with `plugin.json`. `add` and `check` both run it.
List<String> checkFiles(Manifest manifest, Map<String, String> files) {
  final problems = <String>[];

  if (manifest.icon case final icon?) {
    final svg = files[icon]!.trim();
    if (!_svg.hasMatch(svg) || !svg.endsWith('</svg>')) {
      problems.add('$icon: not an SVG');
    }
  }

  if (manifest.source case final path?) {
    final source = files[path]!;
    final size = utf8.encode(module(manifest, files)!).length;
    if (size > maxSource) {
      problems.add(
        '$path: ${(size / 1024).ceil()} KB with the icon, over the '
        '${maxSource ~/ 1024} KB the UI loads',
      );
    }
    final listed = [
      for (final match in _exportList.allMatches(source))
        for (final name in match[1]!.split(','))
          name.trim().split(RegExp(r'\s+')).last,
    ];
    if (!_default.hasMatch(source) && !listed.contains('default')) {
      problems.add('$path: needs a default export');
    }
    if (_exportIcon.hasMatch(source) || listed.contains('icon')) {
      problems.add('$path: exports icon, which devpul adds from the icon file');
    }
    if (_import.hasMatch(source)) {
      problems.add('$path: imports a module; the UI runs one file');
    }
  }

  for (final file in manifest.files.where((f) => f.endsWith('.dart'))) {
    for (final match in _directive.allMatches(files[file]!)) {
      final uri = match[1]!;
      if (uri.startsWith('dart:')) continue;
      if (uri.startsWith('package:')) {
        final package = uri.substring(8).split('/').first;
        if (package != 'devpul' && !manifest.requires.containsKey(package)) {
          problems.add('$file: imports $uri; requires does not list $package');
        }
      } else if (!uri.contains(':')) {
        final path = p.posix.normalize(
          p.posix.join(p.posix.dirname(file), uri),
        );
        if (!manifest.files.contains(path)) {
          problems.add('$file: imports $uri, which files does not list');
        }
      }
    }
  }
  return problems;
}

typedef Checked = ({
  Manifest? manifest,
  Map<String, String> files,
  List<String> problems,
});

/// Every problem with the plugin folder [dir]: plugin.json, the files it
/// lists and the readme, with the files read. The manifest is null when
/// plugin.json does not parse.
Checked checkFolder(String dir) {
  Checked failed(List<String> problems) =>
      (manifest: null, files: const {}, problems: problems);
  final json = File(p.join(dir, 'plugin.json'));
  if (!json.existsSync()) return failed(['no plugin.json']);
  final Manifest manifest;
  final String text;
  try {
    text = json.readAsStringSync();
    manifest = Manifest.parse(jsonDecode(text));
  } on FileSystemException catch (e) {
    return failed(['plugin.json: ${e.message}']);
  } on FormatException catch (e) {
    return failed(['plugin.json: ${e.message}']);
  } on ManifestException catch (e) {
    return failed([for (final problem in e.problems) 'plugin.json: $problem']);
  }
  final problems = [
    for (final key in manifest.unknown) 'plugin.json: $key: unknown field',
  ];
  final files = {'plugin.json': text};
  for (final path in manifest.files) {
    final file = File(p.joinAll([dir, ...p.posix.split(path)]));
    try {
      files[path] = utf8.decode(file.readAsBytesSync());
    } on FileSystemException {
      problems.add('$path: missing');
    } on FormatException {
      problems.add('$path: not UTF-8 text');
    }
  }
  if (manifest.readme case final readme?
      when !File(p.joinAll([dir, ...p.posix.split(readme)])).existsSync()) {
    problems.add('$readme: missing');
  }
  if (problems.isEmpty) problems.addAll(checkFiles(manifest, files));
  return (manifest: manifest, files: files, problems: problems);
}
