import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/plugins/lock.dart';
import 'package:devpul_cli/src/plugins/manifest.dart';
import 'package:devpul_cli/src/plugins/registry.dart';
import 'package:devpul_cli/src/plugins/render.dart';
import 'package:pub_semver/pub_semver.dart';
import 'package:test/test.dart';

// contract/app is an app as devpul leaves it. With DEVPUL_UPDATE_GOLDENS set
// (tool/update_goldens.sh), the lock hashes and the generated file are
// rewritten from the vendored files.
const app = '../../contract/app';
final update = Platform.environment['DEVPUL_UPDATE_GOLDENS'] != null;

Map<String, String> vendored(String id) {
  final dir = Directory('$app/$pluginsDir/$id');
  return {
    for (final file in dir.listSync(recursive: true).whereType<File>())
      file.path.substring(dir.path.length + 1).replaceAll(r'\', '/'): file
          .readAsStringSync(),
  };
}

void main() {
  final lockFile = File('$app/devpul.lock');
  var lock = Lock.parse(lockFile.readAsStringSync());
  final files = {for (final id in lock.plugins.keys) id: vendored(id)};

  test('vendored plugin.json files parse', () {
    final cart = Manifest.parse(jsonDecode(files['cart']!['plugin.json']!));
    expect(cart.id, 'cart');
    expect(cart.version, Version(1, 2, 0));
    expect(cart.devpul.allows(Version(1, 4, 0)), isTrue);
    expect(cart.source, 'cart.js');
    expect(cart.dart, 'cart.dart');
    expect(cart.icon, 'icon.svg');
    final flags = Manifest.parse(jsonDecode(files['flags']!['plugin.json']!));
    expect([flags.dart, flags.icon, flags.usage], [null, null, isEmpty]);
  });

  test('devpul.lock holds the hash of each vendored folder', () {
    final hashes = {
      for (final MapEntry(:key, :value) in files.entries) key: filesHash(value),
    };
    if (update) {
      lock = Lock({
        for (final MapEntry(key: id, value: e) in lock.plugins.entries)
          id: LockEntry(
            url: e.url,
            path: e.path,
            ref: e.ref,
            constraint: e.constraint,
            commit: e.commit,
            version: e.version,
            hash: hashes[id]!,
          ),
      });
      lockFile.writeAsStringSync(lock.encode());
    }
    expect({
      for (final MapEntry(:key, :value) in lock.plugins.entries)
        key: value.hash,
    }, hashes);
    expect(lock.encode(), lockFile.readAsStringSync());
  });

  test('render matches lib/devpul/plugins.dart', () {
    final out = File('$app/$generatedFile');
    final text = render(lock, files);
    if (update) out.writeAsStringSync(text);
    expect(
      out.readAsStringSync(),
      text,
      reason: 'contract/app/$generatedFile differs; run tool/update_goldens.sh',
    );
  });

  test('registry.json lists where each plugin lives', () {
    final registry = parseRegistry(
      File('../../contract/registry.json').readAsStringSync(),
    );
    expect(registry.keys, ['cart', 'flags']);
    expect(registry['cart'], (
      id: 'cart',
      version: Version(1, 3, 0),
      url: 'https://example.com/plugins.git',
      path: 'cart',
    ));
    expect(registry['flags']?.path, isNull);
  });
}
