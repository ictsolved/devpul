import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/plugins/build_registry.dart';
import 'package:devpul_cli/src/plugins/fetch.dart';
import 'package:devpul_cli/src/plugins/registry.dart';
import 'package:path/path.dart' as p;
import 'package:test/test.dart';

import 'plugin_commands_test.dart' show contract, copyDir, git;

/// The contract's cart plugin at [dir], as [id] at [version].
void plugin(String dir, String id, String version, {String readme = ''}) {
  copyDir('$contract/lib/devpul/cart', dir);
  final file = File('$dir/plugin.json');
  final json = jsonDecode(file.readAsStringSync()) as Map<String, Object?>;
  json['id'] = id;
  json['version'] = version;
  file.writeAsStringSync(jsonEncode(json));
  File('$dir/README.md').writeAsStringSync(readme);
}

void commit(String repo, [List<String> tags = const []]) {
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', 'commit']);
  for (final tag in tags) {
    git(repo, ['tag', tag]);
  }
}

void main() {
  late Directory temp;
  late String root;
  late String third;
  late HttpServer server;
  late String served;

  setUpAll(() async {
    temp = await Directory.systemTemp.createTemp('devpul_registry');
    root = p.join(temp.path, 'site');
    plugin('$root/plugins/cart', 'cart', '1.2.0', readme: '# Cart\n');
    plugin('$root/plugins/draft', 'draft', '0.1.0');
    git(temp.path, ['init', '-q', '-b', 'main', root]);
    commit(root, ['cart-v1.2.0']);

    third = p.join(temp.path, 'third');
    plugin('$third/shop', 'shop', '0.1.0', readme: '# Shop\n');
    plugin('$third/bad', 'bad', '1.0.0');
    git(temp.path, ['init', '-q', '-b', 'main', third]);
    commit(third, ['shop-v0.1.0']);
    final bad = File('$third/bad/plugin.json');
    bad.writeAsStringSync(bad.readAsStringSync().replaceFirst('{', '{"x":1,'));
    commit(third, ['bad-v1.0.0']);

    final stock = p.join(temp.path, 'stock');
    plugin(stock, 'stock', '2.0.0', readme: '# Stock\n');
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    served = 'http://127.0.0.1:${server.port}/plugin.json';
    server.listen((request) async {
      final file = File(p.join(stock, request.uri.path.substring(1)));
      if (file.existsSync()) {
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

  late List<String> log;
  Future<BuiltRegistry> build(List<Object?> pointers, {bool local = true}) {
    File('$root/registry/third-party.json')
      ..parent.createSync(recursive: true)
      ..writeAsStringSync(jsonEncode(pointers));
    log = [];
    final cache = temp.createTempSync('cache').path;
    return buildRegistry(
      root,
      repo: 'https://example.com/site',
      fetcher: Fetcher(root: root, cache: cache),
      local: local,
      log: log.add,
    );
  }

  test('lists tagged first-party plugins and third-party pointers', () async {
    final shop = Uri.file(third).toString();
    final built = await build([
      {'id': 'shop', 'url': shop, 'path': 'shop'},
      {'id': 'stock', 'url': served},
    ]);
    expect(built.problems, isEmpty);
    expect(log, ['draft: no draft-v<version> tags, not listed']);
    expect(built.readmes, {
      'cart': '# Cart\n',
      'shop': '# Shop\n',
      'stock': '# Stock\n',
    });

    final json = jsonDecode(built.json) as Map<String, Object?>;
    final plugins = (json['plugins'] as List).cast<Map<String, Object?>>();
    expect(plugins.map((e) => e['id']), ['cart', 'shop', 'stock']);
    final golden =
        jsonDecode(File('../../contract/registry.json').readAsStringSync())
            as Map<String, Object?>;
    final cart = (golden['plugins']! as List).first as Map<String, Object?>;
    expect(plugins[0], {
      ...cart,
      'version': '1.2.0',
      'url': 'https://example.com/site',
      'path': 'plugins/cart',
    });
    expect(plugins[1], containsPair('url', shop));
    expect(plugins[1], containsPair('path', 'shop'));
    expect(plugins[2], containsPair('url', served));
    expect(plugins[2].containsKey('path'), isFalse);

    expect(parseRegistry(built.json).keys, ['cart', 'shop', 'stock']);
  });

  test('fails on broken pointers and plugins', () async {
    final url = Uri.file(third).toString();
    File('$root/plugins/draft/icon.svg').writeAsStringSync('<png>');
    addTearDown(() => git(root, ['checkout', '--', 'plugins/draft']));
    final built = await build([
      {'id': 'bad', 'url': url, 'path': 'bad'},
      {'id': 'cart', 'url': url, 'path': 'shop'},
      {'id': 'shop', 'url': url, 'path': 'shop'},
      {'id': 'shop', 'url': url, 'path': 'shop'},
      {'id': 'other', 'url': url, 'path': 'shop'},
      {'id': 'stock', 'url': served, 'path': 'stock'},
      {'id': 'gone', 'url': 'http://example.com/plugin.json'},
      {'id': 'Up', 'url': url},
      {'id': 'x', 'url': url, 'ref': 'main'},
    ]);
    expect(built.problems, [
      'plugins/draft: icon.svg: not an SVG',
      'registry/third-party.json #1: bad: plugin.json: x: unknown field',
      'registry/third-party.json #2: cart is already listed',
      'registry/third-party.json #4: shop is already listed',
      'registry/third-party.json #5: other: no other-v<version> tags in $url; '
          'pin a branch or commit with #<ref>',
      'registry/third-party.json #6: path is for git URLs',
      'registry/third-party.json #7: url needs an https URL',
      'registry/third-party.json #8: id needs a plugin id',
      'registry/third-party.json #9: needs an object of id, url and path',
    ]);
  });

  test('takes https URLs only', () async {
    final built = await build([
      {'id': 'shop', 'url': Uri.file(third).toString(), 'path': 'shop'},
    ], local: false);
    expect(built.problems, [
      'registry/third-party.json #1: url needs an https URL',
    ]);
  });
}
