import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/cli.dart';
import 'package:devpul_cli/src/plugins/app.dart';
import 'package:devpul_cli/src/plugins/commands.dart';
import 'package:devpul_cli/src/plugins/fetch.dart';
import 'package:devpul_cli/src/plugins/lock.dart';
import 'package:devpul_cli/src/plugins/render.dart';
import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';
import 'package:test/test.dart';

const contract = '../../contract/app';
final contractLock = Lock.parse(
  File('$contract/devpul.lock').readAsStringSync(),
);

void copyDir(String from, String to) {
  for (final file in Directory(from).listSync(recursive: true)) {
    if (file is File) {
      file.copySync(
        (File(
          p.join(to, p.relative(file.path, from: from)),
        )..parent.createSync(recursive: true)).path,
      );
    }
  }
}

void git(String dir, List<String> args) {
  final result = Process.runSync('git', [
    '-c',
    'user.name=a',
    '-c',
    'user.email=a@example.com',
    '-c',
    'commit.gpgsign=false',
    '-c',
    'tag.gpgsign=false',
    ...args,
  ], workingDirectory: dir);
  if (result.exitCode != 0) throw StateError('git $args: ${result.stderr}');
}

String gitOut(String dir, List<String> args) =>
    (Process.runSync('git', args, workingDirectory: dir).stdout as String)
        .trim();

/// Rewrites the version in [repo]/cart/plugin.json, commits and tags it.
void release(String repo, String version, {bool annotated = false}) {
  final file = File('$repo/cart/plugin.json');
  file.writeAsStringSync(
    file.readAsStringSync().replaceFirst(
      RegExp(r'"version": "[^"]*"'),
      '"version": "$version"',
    ),
  );
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', version]);
  git(repo, [
    'tag',
    if (annotated) ...['-am', version],
    'cart-v$version',
  ]);
}

/// An app with a resolved devpul at [devpul], plus [dependencies].
App fakeApp(
  String dir, {
  String devpul = '1.4.0',
  Map<String, String> dependencies = const {},
}) {
  Directory('$dir/.dart_tool').createSync(recursive: true);
  File('$dir/pubspec.yaml').writeAsStringSync('name: app\n');
  File('$dir/.dart_tool/package_config.json').writeAsStringSync(
    jsonEncode({
      'configVersion': 2,
      'packages': [
        {'name': 'app', 'rootUri': '../', 'packageUri': 'lib/'},
      ],
    }),
  );
  final deps = {'devpul': devpul, ...dependencies};
  File('$dir/.dart_tool/package_graph.json').writeAsStringSync(
    jsonEncode({
      'roots': ['app'],
      'packages': [
        {'name': 'app', 'version': '0.0.0', 'dependencies': deps.keys.toList()},
        for (final MapEntry(:key, :value) in deps.entries)
          {'name': key, 'version': value, 'dependencies': <String>[]},
      ],
      'configVersion': 1,
    }),
  );
  return App.open(dir);
}

final class Output {
  final out = StringBuffer();
  final err = StringBuffer();
  final pubAdds = <List<String>>[];

  Console console({bool? answer}) => Console(
    out: out,
    err: err,
    ask: answer == null ? null : (_) async => answer,
    pubAdd: (executable, args) async {
      pubAdds.add([executable, ...args]);
      return 0;
    },
  );
}

void main() {
  late Directory temp;
  late String repo;
  late String cache;
  late HttpServer server;
  late Uri base;

  setUpAll(() async {
    temp = await Directory.systemTemp.createTemp('devpul_plugins');
    repo = p.join(temp.path, 'repo');
    cache = p.join(temp.path, 'cache');
    copyDir('$contract/lib/devpul/cart', '$repo/cart');
    File('$repo/README.md').writeAsStringSync('plugins\n');
    git(temp.path, ['init', '-q', '-b', 'main', repo]);
    release(repo, '1.1.0', annotated: true);
    release(repo, '2.0.0-dev.1');
    release(repo, '1.2.0');

    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    base = Uri.parse('http://127.0.0.1:${server.port}/');
    server.listen((request) async {
      final path = request.uri.path;
      final file = path == '/registry.json'
          ? null
          : File('$contract/lib/devpul${request.uri.path}');
      if (path == '/api/packages/devpul_cli') {
        request.response.write(
          jsonEncode({
            'name': 'devpul_cli',
            'latest': {'version': '1.5.0'},
          }),
        );
      } else if (path == '/registry.json') {
        request.response.write(
          jsonEncode({
            'format': 1,
            'plugins': [
              {
                'id': 'cart',
                'version': '1.2.0',
                'url': Uri.file(repo).toString(),
                'path': 'cart',
              },
              {
                'id': 'flags',
                'version': '0.3.1',
                'url': '${base}flags/plugin.json',
              },
              {
                'id': 'dio',
                'version': '1.0.0',
                'usage': ['dio.interceptors.add(DevpulDioInterceptor())'],
                'package': 'devpul_dio',
                'url': 'https://pub.dev/packages/devpul_dio',
              },
            ],
          }),
        );
      } else if (file != null && file.existsSync()) {
        request.response.add(file.readAsBytesSync());
      } else {
        request.response.statusCode = HttpStatus.notFound;
      }
      await request.response.close();
    });
  });

  tearDownAll(() async {
    await server.close(force: true);
    await temp.delete(recursive: true);
  });

  late App app;
  late Output output;
  late Fetcher fetcher;
  var n = 0;
  setUp(() {
    app = fakeApp(p.join(temp.path, 'app${n++}'));
    output = Output();
    fetcher = Fetcher(
      root: app.root,
      cache: cache,
      registry: '${base}registry.json',
    );
  });

  String gitUrl([String suffix = '']) => '${Uri.file(repo)}$suffix';
  Future<void> addSource(Source source, {bool? answer, bool yes = false}) =>
      add(app, fetcher, source, output.console(answer: answer), yes: yes);
  Future<void> addArg(String arg, {String? path = 'cart'}) =>
      addSource(parseSource(arg, path: path));
  Matcher fails(Object message) => throwsA(
    isA<PluginException>().having((e) => e.message, 'message', message),
  );

  group('parseSource', () {
    test('tells names, URLs and folders apart', () {
      expect(
        parseSource('cart@^1.0.0'),
        isA<RegistrySource>()
            .having((s) => s.id, 'id', 'cart')
            .having((s) => '${s.constraint}', 'constraint', '^1.0.0'),
      );
      expect(
        parseSource('git@example.com:me/plugins.git#main', path: 'cart'),
        isA<GitSource>()
            .having((s) => s.url, 'url', 'git@example.com:me/plugins.git')
            .having((s) => s.ref, 'ref', 'main')
            .having((s) => s.path, 'path', 'cart'),
      );
      expect(
        parseSource('https://me@example.com/plugins.git@1.2.0'),
        isA<GitSource>()
            .having((s) => s.url, 'url', 'https://me@example.com/plugins.git')
            .having((s) => s.constraint, 'constraint', Version(1, 2, 0)),
      );
      expect(
        parseSource('https://example.com/flags/plugin.json'),
        isA<UrlSource>(),
      );
      for (final path in ['./cart', '../plugins/cart', 'plugins/cart']) {
        expect(parseSource(path), isA<LocalSource>(), reason: path);
      }
    });

    test('rejects bad input', () {
      for (final (arg, path) in [
        ('Cart', null),
        ('cart@x', null),
        ('cart#', null),
        ('cart@1.0.0#main', null),
        ('cart', 'cart'),
        ('./cart', 'cart'),
        ('https://example.com/plugin.json#main', null),
        ('https://example.com/plugins.git', '../cart'),
      ]) {
        expect(
          () => parseSource(arg, path: path),
          throwsFormatException,
          reason: arg,
        );
      }
    });
  });

  test('parsePluginArgs', () {
    final add = parsePluginArgs(['add', '--path=cart', 'x', '--yes']);
    expect(add.rest, ['x']);
    expect(add.flags, {'--yes'});
    expect(add.options, {'--path': 'cart'});
    expect(parsePluginArgs(['sync', '--check']).flags, {'--check'});
    expect(parsePluginArgs(['upgrade', '--major-versions']).rest, isEmpty);
    expect(parsePluginArgs(['upgrade', 'cart', '--yes']).rest, ['cart']);
    expect(parsePluginArgs(['outdated', '--exit-code']).flags, {'--exit-code'});
    expect(parsePluginArgs(['create', '--help']).flags, {'--help'});
    expect(parsePluginArgs(['cache', '-h']).flags, {'--help'});
    for (final args in [
      ['add'],
      ['add', 'a', 'b'],
      ['add', 'a', '--path'],
      ['sync', '--yes'],
      ['list', 'x'],
      ['remove'],
      ['cache'],
      ['cache', 'purge'],
      ['upgrade', 'a', 'b'],
      ['outdated', '--yes'],
      ['update', 'x'],
    ]) {
      expect(
        () => parsePluginArgs(args),
        throwsFormatException,
        reason: '$args',
      );
    }
  });

  group('add from git', () {
    test('takes the latest stable tag and records ^version', () async {
      await addArg(gitUrl());
      final entry = app.readLock().plugins['cart']!;
      expect(entry.version, Version(1, 2, 0));
      expect('${entry.constraint}', '^1.2.0');
      expect(entry.commit, gitOut(repo, ['rev-parse', 'cart-v1.2.0']));
      expect([entry.url, entry.path, entry.ref], [gitUrl(), 'cart', null]);
      // The files equal contract/app's copy, version included.
      expect(entry.hash, contractLock.plugins['cart']!.hash);
      expect(
        app.vendored('cart')!.keys,
        unorderedEquals(['plugin.json', 'cart.dart', 'cart.js', 'icon.svg']),
      );
      expect(
        app.generated.readAsStringSync(),
        render(app.readLock(), app.allVendored(app.readLock())),
      );
      expect(output.out.toString(), contains('hash ${entry.hash}'));
      expect(output.out.toString(), contains('  DevpulCart.changed('));
      expect(
        output.out.toString(),
        contains("import 'package:app/devpul/plugins.dart';"),
      );
    });

    test('@version takes a constraint, annotated tags resolve', () async {
      await addArg(gitUrl('@1.1.0'));
      final entry = app.readLock().plugins['cart']!;
      expect('${entry.constraint}', '1.1.0');
      expect(entry.commit, gitOut(repo, ['rev-parse', 'cart-v1.1.0^{}']));
      await expectLater(
        addArg(gitUrl('@^3.0.0')),
        fails(contains('matches ^3.0.0; the latest is 1.2.0')),
      );
    });

    test('#ref pins a branch with no constraint', () async {
      await addArg(gitUrl('#main'));
      final entry = app.readLock().plugins['cart']!;
      expect([entry.ref, entry.constraint], ['main', null]);
      expect(entry.commit, gitOut(repo, ['rev-parse', 'main']));
      await expectLater(
        addArg(gitUrl('#nope')),
        fails(contains('no ref nope')),
      );
    });

    test('a tag must hold its version', () async {
      git(repo, ['tag', 'cart-v1.5.0', 'cart-v1.2.0']);
      addTearDown(() => git(repo, ['tag', '-d', 'cart-v1.5.0']));
      await expectLater(addArg(gitUrl()), fails(contains('holds cart 1.2.0')));
      expect(app.hasLock, isFalse);
    });

    test('names a missing plugin folder', () async {
      await expectLater(
        addArg(gitUrl(), path: 'nope'),
        fails(contains('no plugin.json with an id')),
      );
    });
  });

  test('add from a plugin.json URL', () async {
    await addArg('${base}flags/plugin.json', path: null);
    final entry = app.readLock().plugins['flags']!;
    expect(entry.toJson(), {
      'url': '${base}flags/plugin.json',
      'version': '0.3.1',
      'hash': contractLock.plugins['flags']!.hash,
    });
    await expectLater(
      addArg('${base}nope/plugin.json', path: null),
      fails(contains('HTTP 404')),
    );
    await expectLater(
      addArg('http://example.com/plugin.json', path: null),
      fails(contains('https only')),
    );
  });

  test('add by name through registry.json', () async {
    await addArg('cart', path: null);
    await addArg('flags', path: null);
    final lock = app.readLock();
    expect(lock.plugins.keys, ['cart', 'flags']);
    expect(lock.plugins['cart']!.path, 'cart');
    await expectLater(
      addArg('nope', path: null),
      fails(contains('no plugin nope in')),
    );
    await expectLater(
      addArg('flags@1.0.0', path: null),
      fails(contains('one version only')),
    );
  });

  test('add by name runs pub add for a listed package', () async {
    await expectLater(
      addArg('dio', path: null),
      fails('run dart pub add devpul_dio'),
    );
    await addSource(parseSource('dio@^1.0.0'), yes: true);
    expect(output.pubAdds, [
      ['dart', 'pub', 'add', 'devpul_dio:^1.0.0'],
    ]);
    expect(
      output.out.toString(),
      endsWith('Wiring:\n  dio.interceptors.add(DevpulDioInterceptor())\n'),
    );
    expect(app.hasLock, isFalse);

    app = fakeApp(app.root, dependencies: {'devpul_dio': '1.0.0'});
    await addArg('dio', path: null);
    expect(output.out.toString(), contains('The app depends on devpul_dio.'));
    expect(output.pubAdds, hasLength(1));
    await expectLater(
      addArg('dio#main', path: null),
      fails(contains('#ref is for plugins')),
    );
  });

  test('add from a folder records its path from the app', () async {
    await addSource(LocalSource(p.join(repo, 'cart')));
    final entry = app.readLock().plugins['cart']!;
    expect(
      entry.url,
      p.posix.joinAll(
        p.split(p.relative(p.join(repo, 'cart'), from: app.root)),
      ),
    );
    expect([entry.commit, entry.constraint], [null, null]);
  });

  group('add stops', () {
    test('on a devpul the plugin does not support', () async {
      app = fakeApp(p.join(temp.path, 'old'), devpul: '0.2.0');
      fetcher = Fetcher(root: app.root, cache: cache);
      await expectLater(
        addArg(gitUrl()),
        fails('cart 1.2.0 needs devpul ^1.0.0; the app has 0.2.0'),
      );
      expect(app.hasLock, isFalse);
    });

    test('on edits to the vendored copy', () async {
      await addArg(gitUrl());
      File(
        p.join(app.pluginDir('cart').path, 'cart.js'),
      ).writeAsStringSync('edited');
      await expectLater(
        addArg(gitUrl()),
        fails(contains('has edits that devpul.lock does not')),
      );
    });

    group('on a missing or older required package', () {
      late Directory plugin;
      setUp(() {
        plugin = Directory(p.join(temp.path, 'needs${n++}'));
        copyDir(p.join(repo, 'cart'), plugin.path);
        final file = File(p.join(plugin.path, 'plugin.json'));
        final json = jsonDecode(file.readAsStringSync()) as Map;
        json['requires'] = {'collection': '^1.18.0', 'meta': '^1.10.0'};
        file.writeAsStringSync(jsonEncode(json));
        app = fakeApp(app.root, dependencies: {'meta': '1.9.0'});
      });

      test('with the pub add command', () async {
        await expectLater(
          addSource(LocalSource(plugin.path)),
          fails(
            "nothing written; run dart pub add 'collection:^1.18.0' "
            "'meta:^1.10.0', then add again",
          ),
        );
        expect(output.err.toString(), contains('the app has 1.9.0'));
        expect(app.hasLock, isFalse);
        await expectLater(
          addSource(LocalSource(plugin.path), answer: false),
          fails(startsWith('nothing written')),
        );
        expect(output.pubAdds, isEmpty);
      });

      test('and runs it when asked to', () async {
        await addSource(LocalSource(plugin.path), answer: true);
        await addSource(LocalSource(plugin.path), yes: true);
        expect(output.pubAdds, [
          for (var i = 0; i < 2; i++)
            ['dart', 'pub', 'add', 'collection:^1.18.0', 'meta:^1.10.0'],
        ]);
        expect(app.readLock().plugins.keys, ['cart']);
      });
    });
  });

  test('remove leaves an empty generated file', () async {
    await addArg(gitUrl());
    remove(app, 'cart', output.console());
    expect(app.pluginDir('cart').existsSync(), isFalse);
    expect(app.readLock().plugins, isEmpty);
    expect(app.generated.readAsStringSync(), isNot(contains('import')));
    expect(
      () => remove(app, 'cart', output.console()),
      fails(contains('not in')),
    );
  });

  test('list', () async {
    await addArg(gitUrl());
    await addArg('${base}flags/plugin.json', path: null);
    File(
      p.join(app.pluginDir('flags').path, 'flags.js'),
    ).writeAsStringSync('edited');
    list(app, output.console());
    final commit = gitOut(repo, ['rev-parse', '--short=7', 'cart-v1.2.0']);
    expect(
      output.out
          .toString()
          .split('\n')
          .skipWhile((l) => !l.startsWith('cart  ')),
      [
        'cart   1.2.0  ^1.2.0  ${gitUrl()} cart at $commit',
        'flags  0.3.1          ${base}flags/plugin.json  edited',
        '',
      ],
    );
  });

  group('sync', () {
    setUp(() => copyDir(contract, app.root));

    test('--check passes on contract/app and fails once stale', () async {
      expect(await sync(app, output.console(), check: true), isTrue);
      app.generated.writeAsStringSync('// stale\n');
      expect(await sync(app, output.console(), check: true), isFalse);
      expect(output.err.toString(), contains('plugins.dart is stale'));
      expect(await sync(app, output.console()), isTrue);
      expect(
        app.generated.readAsStringSync(),
        File('$contract/$generatedFile').readAsStringSync(),
      );
      expect(await sync(app, output.console(), check: true), isTrue);
    });

    test('warns about edited plugins and fails on missing files', () async {
      File(
        p.join(app.pluginDir('flags').path, 'flags.js'),
      ).writeAsStringSync('// edited\n');
      expect(await sync(app, output.console()), isTrue);
      expect(
        output.err.toString(),
        contains('flags differs from its devpul.lock hash'),
      );
      File(p.join(app.pluginDir('cart').path, 'cart.js')).deleteSync();
      await expectLater(
        sync(app, output.console()),
        fails('lib/devpul/cart/cart.js is missing'),
      );
    });

    group('copies a folder plugin again', () {
      late String folder;
      setUp(() async {
        folder = p.join(temp.path, 'folder${n++}');
        copyDir(p.join(repo, 'cart'), folder);
        await addSource(LocalSource(folder));
      });
      File js(String dir) => File(p.join(dir, 'cart.js'));

      test('when the folder changed', () async {
        expect(await sync(app, output.console(), check: true), isTrue);
        js(folder).writeAsStringSync('export default {}; // changed\n');
        expect(await sync(app, output.console(), check: true), isFalse);
        expect(output.err.toString(), contains('lib/devpul/cart differs from'));
        expect(await sync(app, output.console()), isTrue);
        expect(
          js(app.pluginDir('cart').path).readAsStringSync(),
          'export default {}; // changed\n',
        );
        expect(app.generated.readAsStringSync(), contains('// changed'));
        expect(
          app.edited(app.readLock(), app.allVendored(app.readLock())),
          isEmpty,
        );
        expect(await sync(app, output.console(), check: true), isTrue);
      });

      test('with a warning on fields this devpul does not know', () async {
        final json = File(p.join(folder, 'plugin.json'));
        json.writeAsStringSync(
          json.readAsStringSync().replaceFirst('{', '{\n  "x": 1,'),
        );
        expect(await sync(app, output.console()), isTrue);
        expect(
          output.err.toString(),
          contains(
            'cart 1.2.0: this devpul ignores plugin.json x; '
            'devpul update may read them.',
          ),
        );
      });

      test('when the copy is missing', () async {
        app.pluginDir('cart').deleteSync(recursive: true);
        expect(await sync(app, output.console()), isTrue);
        expect(js(app.pluginDir('cart').path).existsSync(), isTrue);
      });

      test('but not over edits to the copy', () async {
        js(app.pluginDir('cart').path).writeAsStringSync('// edited\n');
        expect(await sync(app, output.console(), check: true), isFalse);
        await expectLater(
          sync(app, output.console()),
          fails(contains('make them in')),
        );
        expect(
          js(app.pluginDir('cart').path).readAsStringSync(),
          '// edited\n',
        );
      });
    });
  });

  test('devpul sync --check exits 1 when stale', () async {
    Future<ProcessResult> run(String dir) => Process.run(
      Platform.resolvedExecutable,
      [File('bin/devpul.dart').absolute.path, 'sync', '--check'],
      workingDirectory: dir,
    );
    expect((await run(contract)).exitCode, 0);
    copyDir(contract, app.root);
    app.generated.writeAsStringSync('');
    final result = await run(app.root);
    expect([result.exitCode, result.stderr], [1, contains('is stale')]);
  });

  test('cache clean removes the git mirrors', () async {
    await addArg(gitUrl());
    expect(Directory(p.join(cache, 'git')).listSync(), hasLength(1));
    cacheClean(cache, output.console());
    expect(Directory(p.join(cache, 'git')).existsSync(), isFalse);
    cacheClean(cache, output.console());
    expect(output.out.toString(), endsWith('Nothing cached.\n'));
  });

  group('outdated and upgrade', () {
    late String tagged;
    late String pub;
    // One fetcher per command, as in the CLI: a fetcher fetches each mirror
    // once.
    Fetcher fresh() =>
        fetcher = Fetcher(root: app.root, cache: cache, pub: '$base$pub/');
    setUp(() async {
      tagged = p.join(temp.path, 'tagged${n++}');
      copyDir(p.join(repo, 'cart'), p.join(tagged, 'cart'));
      git(temp.path, ['init', '-q', '-b', 'main', tagged]);
      release(tagged, '1.0.0');
      pub = 'api/packages';
      await addArg(Uri.file(tagged).toString());
      await addArg('${base}flags/plugin.json', path: null);
      output = Output();
    });
    String js() => File(
      p.join(app.pluginDir('cart').path, 'plugin.json'),
    ).readAsStringSync();
    Future<bool> outdatedRun() =>
        outdated(app, fresh(), output.console(), cli: Version(1, 4, 0));
    Future<void> upgradeRun({
      String? id,
      bool majorVersions = false,
      bool yes = false,
      bool? answer,
    }) => upgrade(
      app,
      fresh(),
      output.console(answer: answer),
      id: id,
      majorVersions: majorVersions,
      yes: yes,
    );

    test('outdated lists upgradable and latest versions', () async {
      release(tagged, '1.1.0');
      release(tagged, '2.0.0');
      expect(await outdatedRun(), isTrue);
      expect(output.out.toString(), '''
Plugin      Current  Upgradable  Latest
cart        1.0.0    1.1.0       2.0.0
flags       0.3.1    0.3.1       0.3.1
devpul_cli  1.4.0                1.5.0
devpul upgrade takes the upgradable versions.
devpul upgrade --major-versions takes the latest, rewriting constraints.
devpul update updates devpul_cli.
''');
    });

    test('outdated shows can\'t check and fails only on behind', () async {
      pub = 'nope';
      final lock = app.readLock();
      File(p.join(app.root, 'devpul.lock')).writeAsStringSync(
        Lock({
          ...lock.plugins,
          'flags': LockEntry(
            url: '${base}gone/plugin.json',
            version: Version(0, 3, 1),
            hash: lock.plugins['flags']!.hash,
          ),
        }).encode(),
      );
      expect(await outdatedRun(), isFalse);
      expect(output.out.toString(), '''
Plugin      Current  Upgradable  Latest
cart        1.0.0    1.0.0       1.0.0
flags       0.3.1                can't check
devpul_cli  1.4.0                can't check
''');
      expect(output.err.toString(), contains('flags: ${base}gone'));
      expect(
        output.err.toString(),
        contains('devpul_cli: ${base}nope/devpul_cli'),
      );
    });

    test('upgrade shows the diff, asks, and keeps the constraint', () async {
      release(tagged, '1.1.0');
      release(tagged, '2.0.0');
      await upgradeRun(answer: false);
      final out = output.out.toString();
      expect(out, contains('cart 1.0.0 to 1.1.0\n'));
      expect(out, contains('flags 0.3.1 is up to date.'));
      expect(
        out,
        contains(
          'diff --git a/lib/devpul/cart/plugin.json '
          'b/lib/devpul/cart/plugin.json',
        ),
      );
      expect(out, contains('-  "version": "1.0.0",\n+  "version": "1.1.0",'));
      expect(out, endsWith('Nothing written.\n'));
      expect(app.readLock().plugins['cart']!.version, Version(1, 0, 0));

      await expectLater(
        upgradeRun(id: 'cart'),
        fails('nothing written; run devpul upgrade cart --yes to write it'),
      );

      await upgradeRun(answer: true);
      final entry = app.readLock().plugins['cart']!;
      expect(
        [entry.version, '${entry.constraint}'],
        [Version(1, 1, 0), '^1.0.0'],
      );
      expect(entry.commit, gitOut(tagged, ['rev-parse', 'cart-v1.1.0']));
      expect(js(), contains('"version": "1.1.0"'));
      expect(
        app.generated.readAsStringSync(),
        render(app.readLock(), app.allVendored(app.readLock())),
      );

      output = Output();
      await upgradeRun(yes: true);
      expect(output.out.toString(), contains('cart 1.1.0 is up to date.'));
    });

    test('upgrade --major-versions rewrites the constraint', () async {
      release(tagged, '2.0.0');
      await upgradeRun(id: 'cart', majorVersions: true, yes: true);
      final out = output.out.toString();
      expect(out, contains('cart 1.0.0 to 2.0.0, constraint ^1.0.0 to ^2.0.0'));
      expect(out, isNot(contains('diff --git')));
      expect(out, isNot(contains('flags')));
      expect('${app.readLock().plugins['cart']!.constraint}', '^2.0.0');
    });

    test('upgrade moves a ref to its commit now', () async {
      fresh();
      await addArg('${Uri.file(tagged)}#main');
      File(
        p.join(tagged, 'cart', 'cart.js'),
      ).writeAsStringSync('export default {}; // main\n');
      git(tagged, ['commit', '-qam', 'main']);
      final head = gitOut(tagged, ['rev-parse', 'main']);
      output = Output();
      expect(await outdatedRun(), isTrue);
      expect(
        output.out.toString(),
        contains(
          'cart        1.0.0 ${app.readLock().plugins['cart']!.commit!.substring(0, 7)}  1.0.0 ${head.substring(0, 7)}',
        ),
      );
      await upgradeRun(id: 'cart', yes: true);
      final entry = app.readLock().plugins['cart']!;
      expect([entry.ref, entry.commit], ['main', head]);
      expect(
        File(p.join(app.pluginDir('cart').path, 'cart.js')).readAsStringSync(),
        contains('// main'),
      );
    });

    test('upgrade stops on edits and unknown ids', () async {
      release(tagged, '1.1.0');
      await expectLater(
        upgradeRun(id: 'nope'),
        fails('nope is not in devpul.lock'),
      );
      File(
        p.join(app.pluginDir('cart').path, 'cart.js'),
      ).writeAsStringSync('// edited\n');
      await expectLater(
        upgradeRun(yes: true),
        fails(contains('has edits that devpul.lock does not')),
      );
      expect(app.readLock().plugins['cart']!.version, Version(1, 0, 0));
    });
  });

  test('registryUrl matches site.json', () {
    final site = jsonDecode(File('../../site.json').readAsStringSync()) as Map;
    expect(registryUrl, site['registry']);
  });
}
