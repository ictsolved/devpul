import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:pub_semver/pub_semver.dart';

import 'manifest.dart';

final _commit = RegExp(r'^[0-9a-f]{40}$');
final _hash = RegExp(r'^[0-9a-f]{64}$');

/// One plugin in `devpul.lock`.
final class LockEntry {
  LockEntry({
    required this.url,
    this.path,
    this.ref,
    this.constraint,
    this.commit,
    required this.version,
    required this.hash,
  });

  /// A git URL, a `plugin.json` URL, or a path relative to the app.
  final String url;

  /// The plugin folder inside a git repository.
  final String? path;

  /// The git ref the plugin is pinned to.
  final String? ref;

  /// The versions an update may move to, read from `<id>-v<version>` tags.
  final VersionConstraint? constraint;

  /// The resolved git commit.
  final String? commit;
  final Version version;

  /// [filesHash] of the vendored folder.
  final String hash;

  Map<String, Object?> toJson() => {
    'url': url,
    'path': ?path,
    'ref': ?ref,
    'constraint': ?constraint?.toString(),
    'commit': ?commit,
    'version': '$version',
    'hash': hash,
  };
}

/// `devpul.lock` at the app root.
final class Lock {
  Lock(Map<String, LockEntry> plugins)
    : plugins = Map.fromEntries(
        plugins.entries.toList()..sort((a, b) => a.key.compareTo(b.key)),
      );

  static const format = 1;

  /// By id, sorted.
  final Map<String, LockEntry> plugins;

  /// Throws a [FormatException] for anything this version cannot read.
  factory Lock.parse(String text) {
    final json = jsonDecode(text);
    if (json is! Map<String, Object?>) _fail('not a JSON object');
    if (json['format'] != format) {
      _fail('format ${json['format']}; this devpul reads format $format');
    }
    final plugins = json['plugins'];
    if (plugins is! Map<String, Object?>) _fail('plugins needs an object');
    return Lock({
      for (final MapEntry(:key, :value) in plugins.entries)
        key: _entry(key, value),
    });
  }

  String encode() =>
      '${const JsonEncoder.withIndent('  ').convert({
        'format': format,
        'plugins': {for (final MapEntry(:key, :value) in plugins.entries) key: value.toJson()},
      })}\n';
}

Never _fail(String message) => throw FormatException('devpul.lock: $message');

LockEntry _entry(String id, Object? json) {
  if (!isPluginId(id) || json is! Map<String, Object?>) {
    _fail('"$id" is not a plugin id with an object');
  }
  String? read(String key, {bool Function(String)? valid}) {
    final value = json[key];
    if (value == null) return null;
    if (value is! String || !(valid?.call(value) ?? value.isNotEmpty)) {
      _fail('$id.$key: $value is not valid');
    }
    return value;
  }

  String need(String key) => read(key) ?? _fail('$id.$key is required');
  try {
    return LockEntry(
      url: need('url'),
      path: read('path', valid: isPluginPath),
      ref: read('ref'),
      constraint: switch (read('constraint')) {
        final text? => VersionConstraint.parse(text),
        null => null,
      },
      commit: read('commit', valid: _commit.hasMatch),
      version: Version.parse(need('version')),
      hash:
          read('hash', valid: _hash.hasMatch) ?? _fail('$id.hash is required'),
    );
  } on FormatException catch (e) {
    if (e.message.startsWith('devpul.lock')) rethrow;
    _fail('$id: ${e.message}');
  }
}

/// SHA-256 of the `sha256sum` lines of [files], sorted by path, with CRLF
/// read as LF so a Windows checkout hashes the same.
String filesHash(Map<String, String> files) {
  final paths = files.keys.toList()..sort();
  final lines = StringBuffer();
  for (final path in paths) {
    final content = utf8.encode(normalizeNewlines(files[path]!));
    lines.write('${sha256.convert(content)}  $path\n');
  }
  return sha256.convert(utf8.encode(lines.toString())).toString();
}

String normalizeNewlines(String text) => text.replaceAll('\r\n', '\n');
