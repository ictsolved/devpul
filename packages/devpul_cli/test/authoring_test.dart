import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/cli.dart';
import 'package:devpul_cli/src/plugins/app.dart';
import 'package:devpul_cli/src/plugins/check.dart';
import 'package:devpul_cli/src/plugins/commands.dart' show Console, add;
import 'package:devpul_cli/src/plugins/create.dart';
import 'package:devpul_cli/src/plugins/fetch.dart';
import 'package:devpul_cli/src/plugins/lock.dart';
import 'package:devpul_cli/src/plugins/manifest.dart';
import 'package:devpul_cli/src/plugins/render.dart';
import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';
import 'package:test/test.dart';
import 'package:yaml/yaml.dart';

import 'plugin_commands_test.dart' show copyDir, fakeApp;

// contract/create/my_plugin is what devpul create my_plugin writes. With
// DEVPUL_UPDATE_GOLDENS set (tool/update_goldens.sh), it is rewritten.
const golden = '../../contract/create/my_plugin';
final update = Platform.environment['DEVPUL_UPDATE_GOLDENS'] != null;
final devpul = Version(1, 0, 0);

Map<String, String> read(String dir) => {
  for (final file in Directory(dir).listSync(recursive: true).whereType<File>())
    p.posix.joinAll(p.split(p.relative(file.path, from: dir))): file
        .readAsStringSync(),
};

List<String> problems(String dir) => checkFolder(dir).problems;

void main() {
  late Directory temp;
  setUp(() async {
    temp = await Directory.systemTemp.createTemp('devpul_create');
    addTearDown(() => temp.delete(recursive: true));
  });
  String dir([String id = 'my_plugin']) => p.join(temp.path, id);

  test('create writes contract/create/my_plugin, which passes check', () {
    expect(create(dir(), devpul: devpul), [
      'plugin.json',
      'my_plugin.js',
      'icon.svg',
      'my_plugin.dart',
      'devpul.d.ts',
      'README.md',
      'pubspec.yaml',
      'example/main.dart',
    ]);
    if (update) {
      if (Directory(golden).existsSync()) {
        Directory(golden).deleteSync(recursive: true);
      }
      copyDir(dir(), golden);
    }
    expect(
      read(dir()),
      read(golden),
      reason: 'contract/create differs; run tool/update_goldens.sh',
    );
    expect(problems(dir()), isEmpty);
  });

  test('--js and --dart write one half', () {
    create(dir('tab'), js: true, devpul: devpul);
    create(dir('observer'), dart: true, devpul: devpul);
    expect(problems(dir('tab')), isEmpty);
    expect(problems(dir('observer')), isEmpty);
    expect(read(dir('tab')).keys, isNot(contains('tab.dart')));
    expect(read(dir('observer')).keys, isNot(contains('observer.js')));
    expect(read(dir('observer')).keys, isNot(contains('devpul.d.ts')));
    expect(
      read(dir('observer'))['example/main.dart'],
      contains('devpul run example/main.dart'),
    );
  });

  test('create again fills in missing files and keeps the rest', () {
    create(dir(), js: true, devpul: devpul);
    File(p.join(dir(), 'my_plugin.js')).writeAsStringSync('export default 1;');
    File(p.join(dir(), 'icon.svg')).deleteSync();
    File(p.join(dir(), 'devpul.d.ts')).writeAsStringSync('old');
    expect(create(dir(), devpul: devpul), ['icon.svg', 'devpul.d.ts']);
    expect(
      File(p.join(dir(), 'my_plugin.js')).readAsStringSync(),
      'export default 1;',
    );
    expect(create(dir(), devpul: devpul), isEmpty);
  });

  test('create --dart adds the Dart half to a JS plugin', () {
    create(dir(), js: true, devpul: devpul);
    expect(create(dir(), dart: true, devpul: devpul), [
      'plugin.json',
      'my_plugin.dart',
    ]);
    final json = File(p.join(dir(), 'plugin.json')).readAsStringSync();
    expect(json, contains('"dart": "my_plugin.dart"'));
    expect(
      json,
      contains('"files": ["icon.svg", "my_plugin.dart", "my_plugin.js"]'),
    );
    expect(problems(dir()), isEmpty);
  });

  test('create stops on a folder name that is not an id', () {
    expect(
      () => create(dir('my-plugin'), devpul: devpul),
      throwsA(isA<PluginException>()),
    );
    expect(Directory(dir('my-plugin')).existsSync(), isFalse);
  });

  test('a created plugin adds to an app and renders', () async {
    create(dir(), devpul: devpul);
    final app = fakeApp(dir('app'));
    final out = StringBuffer();
    await add(
      app,
      Fetcher(root: app.root, cache: dir('cache')),
      LocalSource(dir()),
      Console(out: out, err: out),
    );
    final generated = app.generated.readAsStringSync();
    expect(generated, contains("export 'my_plugin/my_plugin.dart';"));
    expect(generated, contains("Devpul.plugin(\n      'my_plugin',"));
    expect(generated, contains('export const icon = "<svg'));
    expect(out.toString(), contains("DevpulMyPlugin.set('count', count);"));
  });

  test('a created plugin analyzes against this devpul', () async {
    create(dir(), devpul: devpul);
    File(p.join(dir(), 'pubspec_overrides.yaml')).writeAsStringSync(
      'dependency_overrides:\n'
      '  devpul:\n'
      '    path: ${p.absolute('../devpul')}\n',
    );
    Future<ProcessResult> dart(List<String> args) =>
        Process.run(Platform.resolvedExecutable, args, workingDirectory: dir());
    final get = await dart(['pub', 'get', '--offline']);
    expect(get.exitCode, 0, reason: '${get.stdout}${get.stderr}');
    final analyze = await dart(['analyze', '--fatal-infos']);
    expect(analyze.exitCode, 0, reason: '${analyze.stdout}');
  }, timeout: const Timeout(Duration(minutes: 2)));

  test('the first-party plugins pass check', () {
    for (final plugin in Directory('../../plugins').listSync()) {
      if (plugin is Directory) expect(problems(plugin.path), isEmpty);
    }
  });

  // Renovate widens the pubspec on a new major; requires has to follow.
  test('the first-party plugins require what their pubspecs depend on', () {
    for (final plugin in Directory('../../plugins').listSync()) {
      if (plugin is! Directory) continue;
      final manifest = Manifest.parse(
        jsonDecode(File(p.join(plugin.path, 'plugin.json')).readAsStringSync()),
      );
      final pubspec =
          loadYaml(File(p.join(plugin.path, 'pubspec.yaml')).readAsStringSync())
              as YamlMap;
      expect({...manifest.requires}..remove('flutter'), {
        for (final MapEntry(:key, :value)
            in (pubspec['dependencies'] as YamlMap).entries)
          if (key != 'devpul' && value is String)
            key as String: VersionConstraint.parse(value),
      }, reason: plugin.path);
    }
  });

  group('check', () {
    // Each change breaks the plugin create wrote.
    final broken = <String, (void Function(String dir), String)>{
      'a missing file': (
        (dir) => File(p.join(dir, 'icon.svg')).deleteSync(),
        'icon.svg: missing',
      ),
      'a missing readme': (
        (dir) => File(p.join(dir, 'README.md')).deleteSync(),
        'README.md: missing',
      ),
      'a bad field': (
        (dir) => _edit(dir, 'plugin.json', '"0.1.0"', '"x"'),
        'plugin.json: version: "x" does not parse',
      ),
      'an unknown field': (
        (dir) => _edit(dir, 'plugin.json', '"api": 1,', '"api": 1,\n  "x": 1,'),
        'plugin.json: x: unknown field',
      ),
      'an icon that is not SVG': (
        (dir) => File(p.join(dir, 'icon.svg')).writeAsStringSync('PNG'),
        'icon.svg: not an SVG',
      ),
      'a source over 512 KB': (
        (dir) => File(
          p.join(dir, 'my_plugin.js'),
        ).writeAsStringSync('export default 1; //${'x' * maxSource}'),
        'my_plugin.js: 513 KB with the icon, over the 512 KB the UI loads',
      ),
      'no default export': (
        (dir) => _edit(dir, 'my_plugin.js', 'export default', 'const p ='),
        'my_plugin.js: needs a default export',
      ),
      'an icon export': (
        (dir) => File(p.join(dir, 'my_plugin.js')).writeAsStringSync(
          'const i = "";\nexport { i as icon, i as default };',
        ),
        'my_plugin.js: exports icon, which devpul adds from the icon file',
      ),
      'an import': (
        (dir) => File(
          p.join(dir, 'my_plugin.js'),
        ).writeAsStringSync("import { x } from './x.js';\nexport default x;"),
        'my_plugin.js: imports a module; the UI runs one file',
      ),
      'a Dart import of an unlisted file': (
        (dir) => _edit(
          dir,
          'my_plugin.dart',
          "import 'package:devpul/devpul.dart';",
          "import 'package:devpul/devpul.dart';\nimport 'src/x.dart';",
        ),
        'my_plugin.dart: imports src/x.dart, which files does not list',
      ),
      'a Dart import of an unlisted package': (
        (dir) => _edit(
          dir,
          'my_plugin.dart',
          "import 'package:devpul/devpul.dart';",
          "import 'package:collection/collection.dart';\n"
              "import 'package:devpul/devpul.dart';",
        ),
        'my_plugin.dart: imports package:collection/collection.dart; '
            'requires does not list collection',
      ),
    };
    for (final MapEntry(key: name, value: (change, problem))
        in broken.entries) {
      test('rejects $name', () {
        create(dir(), devpul: devpul);
        change(dir());
        expect(problems(dir()), [problem]);
      });
    }

    test('add runs the same checks', () async {
      create(dir(), devpul: devpul);
      File(p.join(dir(), 'icon.svg')).writeAsStringSync('PNG');
      await expectLater(
        fetchFolder(temp.path, dir()),
        throwsA(
          isA<PluginException>().having(
            (e) => e.message,
            'message',
            'my_plugin 0.1.0: icon.svg: not an SVG',
          ),
        ),
      );
    });

    test('add takes an unknown field', () async {
      create(dir(), devpul: devpul);
      _edit(dir(), 'plugin.json', '"api": 1,', '"api": 1,\n  "x": 1,');
      final fetched = await fetchFolder(temp.path, dir());
      expect(fetched.manifest.unknown, ['x']);
    });

    test('devpul check exits 1 and lists problems', () async {
      create(dir(), devpul: devpul);
      Future<ProcessResult> run() => Process.run(Platform.resolvedExecutable, [
        File('bin/devpul.dart').absolute.path,
        'check',
        dir(),
      ]);
      expect((await run()).stdout, 'my_plugin 0.1.0 passes.\n');
      File(p.join(dir(), 'README.md')).deleteSync();
      final result = await run();
      expect([result.exitCode, result.stderr], [1, 'README.md: missing\n']);
    });
  });

  test('render exports a plugin with no source and offers nothing', () {
    create(dir(), dart: true, devpul: devpul);
    final files = read(dir());
    final text = render(
      Lock({
        'my_plugin': LockEntry(
          url: 'my_plugin',
          version: Version(0, 1, 0),
          hash: filesHash(files),
        ),
      }),
      {'my_plugin': files},
    );
    expect(text, contains("export 'my_plugin/my_plugin.dart';"));
    expect(text, isNot(contains('Devpul.plugin(')));
    expect(text, isNot(contains("import 'package:devpul/devpul.dart';")));
  });

  test('parsePluginArgs reads create and check', () {
    expect(parsePluginArgs(['create', 'x', '--dart']).flags, {'--dart'});
    expect(parsePluginArgs(['check']).rest, ['.']);
    expect(() => parsePluginArgs(['create']), throwsFormatException);
  });

  test('plugin.json is written one field per line in spec order', () {
    expect(
      encodeManifest({
        'files': ['a.js'],
        'id': 'a',
        'requires': {'bloc': '^9.1.0'},
        'tags': <String>[],
      }),
      '{\n'
      '  "id": "a",\n'
      '  "tags": [],\n'
      '  "requires": { "bloc": "^9.1.0" },\n'
      '  "files": ["a.js"]\n'
      '}\n',
    );
  });

  test('devpulVersion reads the devpul pubspec', () async {
    final pubspec = File('../devpul/pubspec.yaml').readAsStringSync();
    expect(pubspec, contains('version: ${await devpulVersion()}\n'));
  });
}

void _edit(String dir, String path, String from, String to) {
  final file = File(p.join(dir, path));
  final text = file.readAsStringSync();
  if (!text.contains(from)) throw StateError('$from is not in $path');
  file.writeAsStringSync(text.replaceFirst(from, to));
}
