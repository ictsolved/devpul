import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/plugins/lock.dart';
import 'package:devpul_cli/src/plugins/manifest.dart';
import 'package:devpul_cli/src/plugins/render.dart';
import 'package:pub_semver/pub_semver.dart';
import 'package:test/test.dart';

Map<String, Object?> manifest([Map<String, Object?> change = const {}]) => {
  'id': 'cart',
  'version': '1.0.0',
  'api': 1,
  'devpul': '^1.0.0',
  'description': 'Cart contents.',
  'source': 'cart.js',
  'files': ['cart.js'],
  ...change,
};

List<String> problems(Map<String, Object?> json) {
  try {
    Manifest.parse(json);
    return const [];
  } on ManifestException catch (e) {
    return e.problems;
  }
}

void main() {
  test('plugin ids', () {
    for (final id in ['a', 'riverpod', 'my_plugin', 'x2', 'a' * 32]) {
      expect(isPluginId(id), isTrue, reason: id);
    }
    for (final id in ['', '2x', '_a', 'My', 'a-b', 'a.b', 'a' * 33]) {
      expect(isPluginId(id), isFalse, reason: id);
    }
  });

  test('plugin paths', () {
    for (final path in ['a.js', 'src/a.dart', 'icons/x-1.svg']) {
      expect(isPluginPath(path), isTrue, reason: path);
    }
    for (final path in [
      '',
      '/a',
      'a/',
      '../a',
      './a',
      'a//b',
      '.env',
      r'a\b',
    ]) {
      expect(isPluginPath(path), isFalse, reason: path);
    }
  });

  group('Manifest.parse', () {
    test('reads a minimal manifest', () {
      final m = Manifest.parse(manifest());
      expect(m.version, Version(1, 0, 0));
      expect([m.dart, m.icon, m.readme], [null, null, null]);
      expect([m.tags, m.usage, m.requires], [isEmpty, isEmpty, isEmpty]);
    });

    test('reads every field', () {
      final m = Manifest.parse(
        manifest({
          'tags': ['state'],
          'icon': 'icon.svg',
          'readme': 'README.md',
          'usage': ['DevpulCart.install();'],
          'requires': {'flutter_riverpod': '^3.0.0'},
          'dart': 'cart.dart',
          'files': ['cart.js', 'cart.dart', 'icon.svg'],
        }),
      );
      expect(m.requires['flutter_riverpod']?.allows(Version(3, 1, 0)), isTrue);
      expect(
        [m.dart, m.icon, m.readme],
        ['cart.dart', 'icon.svg', 'README.md'],
      );
    });

    test('lists every problem', () {
      expect(
        problems(
          manifest({
            'id': 'Cart',
            'version': '1',
            'api': 2,
            'devpul': '^x',
            'description': '',
            'tags': ['State'],
            'usage': <String>[],
            'requires': {'devpul': '^1.0.0', 'http': 1},
            'source': 'cart.ts',
            'files': ['cart.ts', '../x', 'plugin.json'],
            'icon': 'icon.svg',
            'extra': true,
          }),
        ),
        [
          'extra: unknown field',
          'id: a lowercase letter, then up to 31 lowercase letters, digits or _',
          'version: "1" does not parse',
          'devpul: "^x" does not parse',
          'description: one line of 1 to 160 characters',
          'tags: "State": up to 20 lowercase letters, digits or -',
          'usage: 1 to 3 lines',
          'requires: "devpul" is not a package other than devpul',
          'requires: http needs a version constraint string',
          'files: "../x" is not a plain path',
          'files: plugin.json is implied',
          'source: needs a .js file',
          'api: this devpul supports plugin API 1, not 2',
          'icon: icon.svg is not in files',
        ],
      );
    });

    test('names missing and mistyped fields', () {
      expect(problems({'id': 1}), [
        'id: needs a string',
        'version: needs a string',
        'devpul: needs a string',
        'description: needs a string',
        'files: needs a list of strings',
        'source: needs source, dart or both',
      ]);
      expect(problems(manifest({'api': null})), ['api: needs an integer']);
      expect(problems(manifest({'devpul': '>2.0.0 <1.0.0'})), [
        'devpul: allows no version',
      ]);
    });

    test('takes Dart with no source, without api and icon', () {
      final dart = {
        'source': null,
        'dart': 'cart.dart',
        'files': ['cart.dart'],
      };
      expect(Manifest.parse(manifest(dart)..remove('api')).source, isNull);
      expect(
        problems(
          manifest({
            ...dart,
            'icon': 'icon.svg',
            'files': ['cart.dart', 'icon.svg'],
          }),
        ),
        ['api: only with a source', 'icon: only with a source'],
      );
    });
  });

  group('Lock', () {
    final entry = {
      'url': 'https://example.com/a.git',
      'version': '1.0.0',
      'hash': 'a' * 64,
    };

    test('round-trips with sorted ids and absent fields left out', () {
      final text = jsonEncode({
        'format': 1,
        'plugins': {'b': entry, 'a': entry},
      });
      final lock = Lock.parse(text);
      expect(lock.plugins.keys, ['a', 'b']);
      expect(Lock.parse(lock.encode()).encode(), lock.encode());
      expect((jsonDecode(lock.encode()) as Map<String, Object?>)['plugins'], {
        'a': entry,
        'b': entry,
      });
    });

    test('rejects what it cannot read', () {
      Matcher fails(Object message) => throwsA(
        isA<FormatException>().having((e) => e.message, 'message', message),
      );
      String lock(Object? plugins, [int format = 1]) =>
          jsonEncode({'format': format, 'plugins': plugins});

      expect(
        () => Lock.parse(lock({}, 2)),
        fails('devpul.lock: format 2; this devpul reads format 1'),
      );
      expect(
        () => Lock.parse(lock({'A': entry})),
        fails('devpul.lock: "A" is not a plugin id with an object'),
      );
      expect(
        () => Lock.parse(
          lock({
            'a': {...entry, 'hash': 'x'},
          }),
        ),
        fails('devpul.lock: a.hash: x is not valid'),
      );
      expect(
        () => Lock.parse(
          lock({
            'a': {...entry}..remove('url'),
          }),
        ),
        fails('devpul.lock: a.url is required'),
      );
      expect(
        () => Lock.parse(
          lock({
            'a': {...entry, 'version': 'one'},
          }),
        ),
        fails(startsWith('devpul.lock: a: ')),
      );
    });
  });

  test('filesHash matches sha256sum of the sorted files, CRLF as LF', () {
    // printf 'x\n' > a.js; printf '{}' > plugin.json
    // LC_ALL=C sha256sum a.js plugin.json | sha256sum
    const hash =
        '749f1b973adf4b47feb3625ed484b810cf142a60c5cd15a6aa570a0d4960c531';
    expect(filesHash({'plugin.json': '{}', 'a.js': 'x\n'}), hash);
    expect(filesHash({'a.js': 'x\r\n', 'plugin.json': '{}'}), hash);
    expect(filesHash({'a.js': 'y\n', 'plugin.json': '{}'}), isNot(hash));
  });

  test('multiline literals hold any text', () async {
    final texts = [
      'export default {};\n',
      "a ''' b\n",
      "ends with '",
      '''both \''' and """ with \$x and \\n and '\n''',
      '  \nleading blank line',
    ];
    final dir = await Directory.systemTemp.createTemp('devpul_literal');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/main.dart')
      ..writeAsStringSync('''
import 'dart:convert';

void main() => print(jsonEncode([${texts.map(multiline).join(', ')}]));
''');
    final result = await Process.run(Platform.resolvedExecutable, [file.path]);
    expect(result.stderr, '');
    expect(jsonDecode(result.stdout as String), texts);
  });
}
