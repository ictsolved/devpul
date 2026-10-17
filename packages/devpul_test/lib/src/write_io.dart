import 'dart:io';

/// Writes `<directory>/<suite without .dart>/<name>.json` and returns its
/// path.
String? writeSession(String directory, String suite, String name, String json) {
  final cwd = '${Directory.current.path}${Platform.pathSeparator}';
  final relative = suite.startsWith(cwd) ? suite.substring(cwd.length) : suite;
  final folder = relative.endsWith('.dart')
      ? relative.substring(0, relative.length - 5)
      : relative;
  final file = File(
    [directory, if (folder.isNotEmpty) folder, '${_slug(name)}.json'].join('/'),
  );
  file.parent.createSync(recursive: true);
  file.writeAsStringSync(json);
  return file.path;
}

String _slug(String name) {
  final slug = name
      .replaceAll(RegExp(r'[^A-Za-z0-9_-]+'), '_')
      .replaceAll(RegExp(r'^_+|_+$'), '');
  if (slug.isEmpty) return 'test';
  return slug.length > 100 ? slug.substring(0, 100) : slug;
}
