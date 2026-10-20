import 'dart:convert';
import 'dart:io';

const _usage = '''
Usage: dart run tool/release.dart <package> <version>

devpul releases devpul and devpul_cli together with the UI; any other package
releases alone.''';

/// The CLI serves the UI build that ships in devpul.
const _core = ['devpul', 'devpul_cli'];

final _semver = RegExp(r'^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$');

Future<void> main(List<String> args) async {
  if (args.length != 2 || !_semver.hasMatch(args[1])) {
    stderr.writeln(_usage);
    exit(64);
  }
  final [name, version] = args;
  Directory.current = File.fromUri(Platform.script).parent.parent;

  final all = {
    for (final dir in Directory('packages').listSync().whereType<Directory>())
      if (File('${dir.path}/pubspec.yaml').existsSync())
        dir.uri.pathSegments.lastWhere((s) => s.isNotEmpty): dir.path,
  };
  if (!all.containsKey(name)) {
    stderr.writeln('No package $name in packages/');
    exit(64);
  }
  final core = _core.contains(name);
  final packages = {
    for (final n in core ? _core : [name]) n: all[n]!,
  };

  for (final path in packages.values) {
    _bumpPubspec(File('$path/pubspec.yaml'), version, packages.keys);
  }
  // Packages outside the release raise a constraint only when they need it.
  final apps = [
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
  for (final pubspec in apps) {
    _bumpPubspec(pubspec, version, packages.keys, own: core);
  }
  for (final file in _snippetFiles()) {
    _bumpSnippets(file, version, packages.keys);
  }
  if (core) {
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
  }

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
  if (core) _run('npm', ['run', 'build:extension']);

  final tag = core ? 'v$version' : '$name-v$version';
  final steps = [
    'npm run check',
    'git commit -am "Release ${core ? version : '$name $version'}"',
    if (core) 'node tool/build_extension.mjs --check',
    for (final name in _publishOrder(packages))
      '(cd ${packages[name]} && '
          '${name == 'devpul_flutter' ? 'flutter' : 'dart'} pub publish)',
    'git tag $tag',
    'git push origin main $tag',
    // The site deploys from stable.
    if (core) ...[
      'git switch stable && git merge --no-edit $tag',
      'git push origin stable && git switch main',
    ],
  ];
  final done = core
      ? 'devpul and devpul_cli set to $version and the UI built into '
            'packages/devpul'
      : '$name set to $version';
  stdout.writeln('$done. Next:\n\n${steps.map((s) => '  $s').join('\n')}');
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

void _bumpPubspec(
  File file,
  String version,
  Iterable<String> packages, {
  bool own = true,
}) {
  var text = file.readAsStringSync();
  if (own) {
    text = text.replaceFirst(
      RegExp(r'^version: .*$', multiLine: true),
      'version: $version',
    );
  }
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
