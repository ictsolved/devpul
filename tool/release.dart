import 'dart:convert';
import 'dart:io';

const _usage = 'Usage: dart run tool/release.dart <version>';

final _semver = RegExp(r'^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$');

Future<void> main(List<String> args) async {
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
      // Flutter's .plugin_symlinks point into the pub cache.
      ...Directory(dir)
          .listSync(recursive: true, followLinks: false)
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
  File('packages/devpul/lib/src/version.dart').writeAsStringSync('''
// Written by tool/release.dart.
const packageVersion = '$version';
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

  await _checkSemver({
    for (final MapEntry(:key, :value) in packages.entries)
      if (File('$value/api.txt').existsSync()) key: value,
  });

  // The UI shows its version, so it is built after the bump.
  _run('npm', ['run', 'build:extension']);

  stdout.writeln('''
Versions set to $version and the UI built into packages/devpul. Next:

  npm run check
  git commit -am "Release $version"
  node tool/build_extension.mjs --check
${[for (final name in _publishOrder(packages)) '  (cd ${packages[name]} && ${name == 'devpul_flutter' ? 'flutter' : 'dart'} pub publish)'].join('\n')}
  git tag v$version
  git push origin main v$version''');
}

/// Fails when a package's new version is a smaller bump than dart_apitool's
/// verdict against its latest version on pub.dev.
Future<void> _checkSemver(Map<String, String> packages) async {
  const tool = 'dart_apitool';
  const toolVersion = '0.23.2';
  final active = Process.runSync('dart', ['pub', 'global', 'list']).stdout;
  if (!(active as String).split('\n').contains('$tool $toolVersion')) {
    _run('dart', ['pub', 'global', 'activate', tool, toolVersion]);
  }
  final client = HttpClient();
  final failed = <String>[];
  for (final MapEntry(key: name, value: path) in packages.entries) {
    final request = await client.getUrl(
      Uri.https('pub.dev', '/api/packages/$name'),
    );
    request.headers.set('accept', 'application/vnd.pub.v2+json');
    final response = await request.close();
    final body = await response.transform(utf8.decoder).join();
    if (response.statusCode == 404) continue;
    if (response.statusCode != 200) {
      stderr.writeln('pub.dev answered ${response.statusCode} for $name');
      exit(1);
    }
    final json = jsonDecode(body) as Map<String, Object?>;
    final last = (json['latest'] as Map<String, Object?>)['version'];
    stdout.writeln('Checking $name against $last');
    final diff = Process.runSync('dart', [
      'pub',
      'global',
      'run',
      '$tool:main',
      'diff',
      '--old',
      'pub://$name/$last',
      '--new',
      path,
    ]);
    if (diff.exitCode != 0) {
      stderr
        ..write(diff.stdout)
        ..write(diff.stderr);
      failed.add(name);
    }
  }
  client.close();
  if (failed.isNotEmpty) {
    stderr.writeln('Version check failed for: ${failed.join(', ')}');
    exit(1);
  }
}

void _run(String executable, List<String> args) {
  final result = Process.runSync(executable, args, runInShell: true);
  if (result.exitCode != 0) {
    stderr
      ..write(result.stdout)
      ..write(result.stderr);
    exit(1);
  }
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
