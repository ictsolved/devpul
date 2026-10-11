import 'dart:convert';
import 'dart:io';

const _usage = 'Usage: dart run tool/release.dart <version>';

final _semver = RegExp(r'^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$');

void main(List<String> args) {
  if (args.length != 1 || !_semver.hasMatch(args.single)) {
    stderr.writeln(_usage);
    exit(64);
  }
  final version = args.single;
  Directory.current = File.fromUri(Platform.script).parent.parent;

  final packages = {
    for (final dir in Directory('packages').listSync().whereType<Directory>())
      if (File('${dir.path}/pubspec.yaml').existsSync())
        dir.uri.pathSegments.lastWhere((s) => s.isNotEmpty): dir.path,
  };

  final pubspecs = [
    for (final path in packages.values) File('$path/pubspec.yaml'),
    for (final dir in [
      'examples',
      'plugins',
      'contract/app',
      'apps/docs/samples',
    ])
      ...Directory(dir)
          .listSync(recursive: true)
          .whereType<File>()
          .where(
            (f) =>
                f.uri.pathSegments.last == 'pubspec.yaml' &&
                !f.path.contains('/build/') &&
                !f.path.contains('/.dart_tool/'),
          ),
  ];
  for (final pubspec in pubspecs) {
    _bumpPubspec(pubspec, version, packages.keys);
  }
  for (final file in _snippetFiles()) {
    _bumpSnippets(file, version, packages.keys);
  }
  _bumpJson(File('apps/ui/package.json'), version, (json) => json);
  _bumpJson(
    File('package-lock.json'),
    version,
    (json) => (json['packages'] as Map)['apps/ui'] as Map<String, Object?>,
  );
  final config = File('packages/devpul/extension/devtools/config.yaml');
  config.writeAsStringSync(
    config.readAsStringSync().replaceFirst(
      RegExp(r'^version: .*$', multiLine: true),
      'version: $version',
    ),
  );
  final site = jsonDecode(File('site.json').readAsStringSync()) as Map;
  File('packages/devpul/lib/src/version.dart').writeAsStringSync('''
// Written by tool/release.dart.
const packageVersion = '$version';
const siteUrl = '${site['url']}';
''');

  final missing = [
    for (final MapEntry(:key, :value) in packages.entries)
      if (!File(
        '$value/CHANGELOG.md',
      ).readAsLinesSync().first.startsWith('## $version'))
        key,
  ];
  if (missing.isNotEmpty) {
    stderr.writeln(
      'CHANGELOG.md does not start with "## $version" in: '
      '${missing.join(', ')}',
    );
    exit(1);
  }

  // The UI shows its version, so it is built after the bump.
  final build = Process.runSync('npm', [
    'run',
    'build:extension',
  ], runInShell: true);
  if (build.exitCode != 0) {
    stderr
      ..write(build.stdout)
      ..write(build.stderr);
    exit(1);
  }

  stdout.writeln('''
Versions set to $version and the UI built into packages/devpul. Next:

  npm run check
  git commit -am "Release $version"
  node tool/build_extension.mjs --check
${[for (final name in _publishOrder(packages)) '  (cd ${packages[name]} && ${name == 'devpul_flutter' ? 'flutter' : 'dart'} pub publish)'].join('\n')}
  git tag v$version
  git push origin main v$version''');
}

void _bumpPubspec(File file, String version, Iterable<String> packages) {
  var text = file.readAsStringSync().replaceFirst(
    RegExp(r'^version: .*$', multiLine: true),
    'version: $version',
  );
  for (final name in packages) {
    text = text.replaceAll(
      RegExp('^  $name: \\^.*\$', multiLine: true),
      '  $name: ^$version',
    );
  }
  file.writeAsStringSync(text);
}

/// Files with install snippets: READMEs, docs pages and the app's home page.
Iterable<File> _snippetFiles() => [
  File('README.md'),
  for (final dir in Directory('packages').listSync().whereType<Directory>())
    if (File('${dir.path}/README.md').existsSync())
      File('${dir.path}/README.md'),
  ...Directory('apps/docs/src/content/docs')
      .listSync(recursive: true)
      .whereType<File>()
      .where((f) => f.path.endsWith('.md')),
  File('apps/ui/src/features/home/Home.tsx'),
];

void _bumpSnippets(File file, String version, Iterable<String> packages) {
  final text = file.readAsStringSync().replaceAllMapped(
    RegExp('\\b(${packages.join('|')}): \\^[0-9A-Za-z.+-]+'),
    (m) => '${m[1]}: ^$version',
  );
  file.writeAsStringSync(text);
}

void _bumpJson(
  File file,
  String version,
  Map<String, Object?> Function(Map<String, Object?>) target,
) {
  final json = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
  target(json)['version'] = version;
  file.writeAsStringSync(
    '${const JsonEncoder.withIndent('  ').convert(json)}\n',
  );
}

/// Each package after the workspace packages it depends on.
List<String> _publishOrder(Map<String, String> packages) {
  final deps = {
    for (final MapEntry(:key, :value) in packages.entries)
      key: {
        for (final other in packages.keys)
          if (other != key &&
              RegExp(
                '^  $other:',
                multiLine: true,
              ).hasMatch(File('$value/pubspec.yaml').readAsStringSync()))
            other,
      },
  };
  final order = <String>[];
  void visit(String name) {
    if (order.contains(name)) return;
    deps[name]!.forEach(visit);
    order.add(name);
  }

  (packages.keys.toList()..sort()).forEach(visit);
  return order;
}
