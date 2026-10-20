import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';

import 'app.dart';
import 'check.dart';
import 'lock.dart';
import 'manifest.dart';
import 'registry.dart';

/// Matches `registry` in site.json, checked by a test.
const registryUrl = 'https://devpul.saradgajurel.com.np/plugins/registry.json';

const pubUrl = 'https://pub.dev/api/packages/';

/// Where `devpul add` takes a plugin from.
sealed class Source {}

/// A plugin listed in registry.json.
final class RegistrySource extends Source {
  RegistrySource(this.id, {this.ref, this.constraint});

  final String id;
  final String? ref;
  final VersionConstraint? constraint;
}

final class GitSource extends Source {
  GitSource(this.url, {this.path, this.ref, this.constraint});

  final String url;

  /// The plugin folder in the repository.
  final String? path;
  final String? ref;
  final VersionConstraint? constraint;
}

/// A `plugin.json` URL; the files sit next to it.
final class UrlSource extends Source {
  UrlSource(this.url);

  final String url;
}

/// A plugin folder on disk.
final class LocalSource extends Source {
  LocalSource(this.path);

  final String path;
}

final _scp = RegExp(r'^[\w.-]+@[\w.-]+:');

/// Whether a devpul.lock `url` is a folder rather than a URL.
bool isFolder(String url) => !url.contains('://') && !_scp.hasMatch(url);

/// Reads `<name | git-url | plugin.json-url | folder>[#ref|@version]`.
/// [path] is the plugin folder in a git repository. Throws a
/// [FormatException] for a usage error.
Source parseSource(String arg, {String? path}) {
  final url = !isFolder(arg);
  final local =
      !url &&
      (arg.startsWith('.') ||
          arg.contains('/') ||
          arg.contains(r'\') ||
          p.isAbsolute(arg));
  if (local) {
    if (path != null) throw const FormatException('--path is for git URLs');
    return LocalSource(arg);
  }

  var rest = arg;
  String? ref;
  VersionConstraint? constraint;
  final hash = rest.lastIndexOf('#');
  if (hash != -1) {
    ref = rest.substring(hash + 1);
    rest = rest.substring(0, hash);
    if (ref.isEmpty) throw FormatException('$arg: empty #ref');
  }
  final at = rest.lastIndexOf('@');
  if (at > rest.lastIndexOf('/') && at > rest.lastIndexOf(':')) {
    final text = rest.substring(at + 1);
    rest = rest.substring(0, at);
    try {
      constraint = VersionConstraint.parse(text);
    } on FormatException {
      throw FormatException('$arg: "$text" is not a version constraint');
    }
  }
  if (ref != null && constraint != null) {
    throw FormatException('$arg: pass #ref or @version, not both');
  }

  if (!url) {
    if (!isPluginId(rest)) {
      throw FormatException('$arg is not a plugin name, URL or folder');
    }
    if (path != null) throw const FormatException('--path is for git URLs');
    return RegistrySource(rest, ref: ref, constraint: constraint);
  }
  final uri = Uri.tryParse(rest);
  if (uri != null &&
      (uri.scheme == 'https' || uri.scheme == 'http') &&
      uri.path.endsWith('/plugin.json')) {
    if (ref != null || constraint != null || path != null) {
      throw FormatException(
        '$arg: a plugin.json URL serves one version; #ref, @version and '
        '--path are for git URLs',
      );
    }
    return UrlSource(rest);
  }
  if (path != null && !isPluginPath(path)) {
    throw FormatException('--path $path is not a relative / separated path');
  }
  return GitSource(rest, path: path, ref: ref, constraint: constraint);
}

/// What a lock entry can move to: [upgradable] within its constraint, or
/// where its ref or source points now, at [commit] for git; [latest]
/// overall. [upgradable] is null when no version fits the constraint.
typedef Available = ({Version? upgradable, String? commit, Version latest});

/// A plugin as fetched, before it is vendored.
final class Fetched {
  Fetched(
    this.manifest,
    this.files, {
    required String url,
    String? path,
    String? ref,
    VersionConstraint? constraint,
    String? commit,
  }) : entry = LockEntry(
         url: url,
         path: path,
         ref: ref,
         constraint: constraint,
         commit: commit,
         version: manifest.version,
         hash: filesHash(files),
       );

  final Manifest manifest;

  /// `plugin.json` and every file it lists.
  final Map<String, String> files;
  final LockEntry entry;
}

/// Fetches plugins over the network, from git mirrors in [cache], or from
/// disk relative to [root].
final class Fetcher {
  Fetcher({
    required this.root,
    required this.cache,
    this.registry = registryUrl,
    this.pub = pubUrl,
  });

  final String root;
  final String cache;
  final String registry;

  /// The pub.dev API URL that package names are appended to.
  final String pub;

  Future<Map<String, RegistryEntry>>? _entries;

  /// Mirrors fetched by this fetcher, so each repository is fetched once.
  final _mirrors = <String, Future<_Repo>>{};

  /// Prints progress.
  void Function(String line) log = (_) {};

  Future<Fetched> fetch(Source source) => switch (source) {
    RegistrySource() => _registry(source),
    GitSource(:final url, :final path, :final ref, :final constraint) => _git(
      url,
      path,
      ref: ref,
      constraint: constraint,
    ),
    UrlSource(:final url) => _url(url),
    LocalSource(:final path) => fetchFolder(root, path),
  };

  /// Fetches what [entry] moves to on upgrade: the newest tag within its
  /// constraint, or with [majorVersions] the newest overall, keeping the
  /// constraint when it allows that one. Refs and other sources fetch what
  /// they point at now.
  Future<Fetched> refetch(
    String id,
    LockEntry entry, {
    bool majorVersions = false,
  }) {
    if (isFolder(entry.url)) return fetchFolder(root, entry.url);
    if (parseSource(entry.url) case UrlSource(:final url)) return _url(url);
    return _git(
      entry.url,
      entry.path,
      ref: entry.ref,
      constraint: entry.constraint,
      majorVersions: majorVersions,
      id: id,
    );
  }

  /// Reads where [entry] can move without fetching its files.
  Future<Available> available(String id, LockEntry entry) async {
    if (isFolder(entry.url)) {
      final file = File(p.join(root, entry.url, 'plugin.json'));
      if (!file.existsSync()) {
        throw PluginException('no plugin.json in ${entry.url}');
      }
      final version = _manifest(file.readAsStringSync()).version;
      return (upgradable: version, commit: null, latest: version);
    }
    if (parseSource(entry.url) case UrlSource(:final url)) {
      final version = _manifest(await _get(Uri.parse(url))).version;
      return (upgradable: version, commit: null, latest: version);
    }
    final repo = await _mirror(entry.url);
    final where = entry.path == null
        ? entry.url
        : '${entry.url} (${entry.path})';
    if (entry.ref case final ref?) {
      final commit =
          await repo.resolve(ref) ??
          (throw PluginException('no ref $ref in ${entry.url}'));
      final file = entry.path == null
          ? 'plugin.json'
          : '${entry.path}/plugin.json';
      final text =
          await repo.read(commit, file) ??
          (throw PluginException('no plugin.json in $where at $ref'));
      final version = _manifest(text).version;
      return (upgradable: version, commit: commit, latest: version);
    }
    final all = await repo.tags('$id-v');
    if (all.isEmpty) throw PluginException('no $id-v<version> tags in $where');
    final allowed = [
      for (final version in all.keys)
        if (entry.constraint?.allows(version) ?? true) version,
    ];
    final upgradable = allowed.isEmpty ? null : Version.primary(allowed);
    return (
      upgradable: upgradable,
      commit: all[upgradable],
      latest: Version.primary(all.keys.toList()),
    );
  }

  /// The latest devpul_cli on pub.dev.
  Future<Version> latestCli() async =>
      (await latestPackage('devpul_cli')).version;

  /// The latest version of [package] on pub.dev, with its description, when
  /// it was published and its archive.
  Future<
    ({Version version, String? description, DateTime? published, Uri? archive})
  >
  latestPackage(String package) async {
    final url = '$pub$package';
    final text = await _get(Uri.parse(url));
    try {
      if (jsonDecode(text) case {
        'latest': {'version': final String version} && final latest,
      }) {
        return (
          version: Version.parse(version),
          description: switch (latest['pubspec']) {
            {'description': final String description} => description,
            _ => null,
          },
          published: switch (latest['published']) {
            final String published => DateTime.tryParse(published),
            _ => null,
          },
          archive: switch (latest['archive_url']) {
            final String url => Uri.tryParse(url),
            _ => null,
          },
        );
      }
    } on FormatException {
      // Below.
    }
    throw PluginException('$url: no latest version');
  }

  /// Plugin [id] as registry.json lists it.
  Future<RegistryEntry> lookup(String id) async {
    final Map<String, RegistryEntry> entries;
    try {
      entries = await (_entries ??= _readRegistry());
    } on FormatException catch (e) {
      throw PluginException(e.message);
    }
    return entries[id] ?? (throw PluginException('no plugin $id in $registry'));
  }

  Future<Map<String, RegistryEntry>> _readRegistry() async {
    log('Reading $registry');
    return parseRegistry(await _get(Uri.parse(registry)));
  }

  Future<Fetched> _registry(RegistrySource source) async {
    final entry = await lookup(source.id);
    if (entry.package case final package?) {
      throw PluginException(
        '${source.id} is the pub package $package; devpul add ${source.id} '
        'adds it with pub',
      );
    }
    return listed(
      source.id,
      entry.url,
      entry.path,
      ref: source.ref,
      constraint: source.constraint,
    );
  }

  /// Fetches plugin [id] as registry.json lists it: the newest tag of the
  /// git repository [url], in [path], or the `plugin.json` URL [url].
  Future<Fetched> listed(
    String id,
    String url,
    String? path, {
    String? ref,
    VersionConstraint? constraint,
  }) async {
    final Fetched fetched;
    if (parseSource(url) case UrlSource(:final url)) {
      if (ref != null || constraint != null) {
        throw PluginException('$id is served from $url, one version only');
      }
      fetched = await _url(url);
    } else {
      fetched = await _git(url, path, ref: ref, constraint: constraint, id: id);
    }
    if (fetched.manifest.id != id) {
      throw PluginException('$url holds ${fetched.manifest.id}, not $id');
    }
    return fetched;
  }

  /// The readme of [fetched] from git or a URL, or null when it has none.
  Future<String?> readme(Fetched fetched) async {
    final readme = fetched.manifest.readme;
    if (readme == null) return null;
    if (fetched.files[readme] case final text?) return text;
    final LockEntry(:url, :path, :commit) = fetched.entry;
    if (commit != null) {
      final file = path == null ? readme : '$path/$readme';
      return await (await _mirror(url)).read(commit, file) ??
          (throw PluginException('$readme is missing in $url'));
    }
    return _get(Uri.parse(url).resolve(readme));
  }

  /// The README.md of the pub package [archive], or null when it has none.
  Future<String?> packageReadme(Uri archive) async {
    try {
      final file = _untar(gzip.decode(await _bytes(archive)), 'README.md');
      return file == null ? null : utf8.decode(file);
    } on FormatException catch (e) {
      throw PluginException('$archive: ${e.message}');
    }
  }

  /// The commit date of [fetched] from git, or null when it was served
  /// from a URL.
  Future<DateTime?> published(Fetched fetched) async {
    final LockEntry(:url, :commit) = fetched.entry;
    return commit == null ? null : (await _mirror(url)).date(commit);
  }

  Future<Fetched> _url(String url) async {
    final base = Uri.parse(url);
    if (base.scheme != 'https' && !_loopback(base.host)) {
      throw PluginException('$url: plugins download over https only');
    }
    log('Fetching $url');
    final (manifest, files) = await _read(
      'plugin.json',
      (path) => _get(base.resolve(path)),
    );
    return Fetched(manifest, files, url: url);
  }

  Future<Fetched> _git(
    String url,
    String? path, {
    String? ref,
    VersionConstraint? constraint,
    bool majorVersions = false,
    String? id,
  }) async {
    final repo = await _mirror(url);
    String at(String file) => path == null ? file : '$path/$file';
    final where = path == null ? url : '$url ($path)';

    final String commit;
    Version? tagged;
    if (ref != null) {
      commit =
          await repo.resolve(ref) ??
          (throw PluginException('no ref $ref in $url'));
    } else {
      id ??= _looseId(await repo.read('HEAD', at('plugin.json')), where);
      final all = await repo.tags('$id-v');
      final allowed = [
        for (final version in all.keys)
          if (majorVersions || (constraint?.allows(version) ?? true)) version,
      ];
      if (allowed.isEmpty) {
        throw PluginException(
          all.isEmpty
              ? 'no $id-v<version> tags in $url; pin a branch or commit '
                    'with #<ref>'
              : 'no $id-v tag in $url matches $constraint; the latest is '
                    '${Version.primary(all.keys.toList())}',
        );
      }
      final version = tagged = Version.primary(allowed);
      commit = all[version]!;
      if (constraint == null || !constraint.allows(version)) {
        constraint = VersionConstraint.compatibleWith(version);
      }
    }

    final (manifest, files) = await _read('plugin.json', (file) async {
      return await repo.read(commit, at(file)) ??
          (throw PluginException(
            '$file is missing in $where at ${commit.substring(0, 7)}',
          ));
    });
    if (tagged != null && (manifest.id != id || manifest.version != tagged)) {
      throw PluginException(
        'tag $id-v$tagged in $where holds ${manifest.id} ${manifest.version}',
      );
    }
    return Fetched(
      manifest,
      files,
      url: url,
      path: path,
      ref: ref,
      constraint: constraint,
      commit: commit,
    );
  }

  /// A mirror of [url] in the cache, fetched now.
  Future<_Repo> _mirror(String url) => _mirrors[url] ??= _fetchMirror(url);

  Future<_Repo> _fetchMirror(String url) async {
    final name = url
        .replaceFirst(RegExp(r'/+$'), '')
        .split(RegExp(r'[/:]'))
        .last
        .replaceFirst(RegExp(r'\.git$'), '')
        .replaceAll(RegExp(r'[^\w.-]'), '_');
    final key = sha256.convert(utf8.encode(url)).toString().substring(0, 12);
    final dir = p.join(cache, 'git', '$name-$key');
    final repo = _Repo(dir);
    if (Directory(dir).existsSync()) {
      log('Fetching $url');
      await repo.git(['fetch', '--quiet', '--prune', 'origin']);
      return repo;
    }
    log('Cloning $url');
    final temp = '$dir.$pid';
    Directory(p.dirname(dir)).createSync(recursive: true);
    try {
      await _Repo(p.dirname(dir)).git([
        'clone',
        '--quiet',
        '--mirror',
        '--filter=blob:none',
        '--',
        url,
        temp,
      ]);
      Directory(temp).renameSync(dir);
    } finally {
      if (Directory(temp).existsSync()) {
        Directory(temp).deleteSync(recursive: true);
      }
    }
    return repo;
  }
}

/// Reads the plugin folder at [path], relative to [root]. The entry's `url`
/// is the folder relative to [root].
Future<Fetched> fetchFolder(String root, String path) async {
  final dir = p.normalize(p.absolute(root, path));
  if (!File(p.join(dir, 'plugin.json')).existsSync()) {
    throw PluginException('no plugin.json in $dir');
  }
  final (manifest, files) = await _read('plugin.json', (file) async {
    final f = File(p.joinAll([dir, ...p.posix.split(file)]));
    try {
      return utf8.decode(f.readAsBytesSync());
    } on FileSystemException {
      throw PluginException('$file is missing in $dir');
    } on FormatException {
      throw PluginException('${f.path} is not UTF-8 text');
    }
  });
  return Fetched(
    manifest,
    files,
    url: p.posix.joinAll(p.split(p.relative(dir, from: root))),
  );
}

/// Reads [manifestPath] with [read], then every file it lists.
Future<(Manifest, Map<String, String>)> _read(
  String manifestPath,
  Future<String> Function(String path) read,
) async {
  final text = await read(manifestPath);
  final manifest = _manifest(text);
  final files = {
    manifestPath: text,
    for (final file in manifest.files) file: await read(file),
  };
  final problems = checkFiles(manifest, files);
  if (problems.isNotEmpty) {
    throw PluginException(
      '${manifest.id} ${manifest.version}: ${problems.join('; ')}',
    );
  }
  return (manifest, files);
}

Manifest _manifest(String text) {
  try {
    return Manifest.parse(jsonDecode(text));
  } on FormatException catch (e) {
    throw PluginException('plugin.json: ${e.message}');
  } on ManifestException catch (e) {
    throw PluginException('$e');
  }
}

String _looseId(String? text, String where) {
  try {
    if (jsonDecode(text ?? '') case {
      'id': final String id,
    } when isPluginId(id)) {
      return id;
    }
  } on FormatException {
    // Below.
  }
  throw PluginException('no plugin.json with an id in $where');
}

bool _loopback(String host) =>
    host == 'localhost' ||
    (InternetAddress.tryParse(host)?.isLoopback ?? false);

Future<String> _get(Uri uri) async {
  final bytes = await _bytes(uri);
  try {
    return utf8.decode(bytes);
  } on FormatException {
    throw PluginException('$uri is not UTF-8 text');
  }
}

Future<List<int>> _bytes(Uri uri) async {
  final client = HttpClient();
  try {
    final response = await (await client.getUrl(uri)).close();
    final bytes = await response.fold(<int>[], (a, b) => a..addAll(b));
    if (response.statusCode != HttpStatus.ok) {
      throw PluginException('$uri: HTTP ${response.statusCode}');
    }
    return bytes;
  } on IOException catch (e) {
    throw PluginException('$uri: $e');
  } finally {
    client.close();
  }
}

/// The regular file [name] in the tar archive [tar], or null when it has
/// none.
List<int>? _untar(List<int> tar, String name) {
  var at = 0;
  while (at + 512 <= tar.length) {
    final header = tar.sublist(at, at + 512);
    if (header.every((byte) => byte == 0)) return null;
    String field(int start, int length) {
      final bytes = header.sublist(start, start + length);
      final end = bytes.indexOf(0);
      return latin1.decode(end < 0 ? bytes : bytes.sublist(0, end));
    }

    final size =
        int.tryParse(field(124, 12).trim(), radix: 8) ??
        (throw const FormatException('not a tar archive'));
    // POSIX ustar splits long paths into a prefix; GNU uses those bytes
    // for other fields.
    final prefix = field(257, 6) == 'ustar' ? field(345, 155) : '';
    final path = prefix.isEmpty ? field(0, 100) : '$prefix/${field(0, 100)}';
    at += 512;
    if (const {0, 0x30}.contains(header[156]) && path == name) {
      if (at + size > tar.length) {
        throw const FormatException('truncated tar archive');
      }
      return tar.sublist(at, at + size);
    }
    at += (size + 511) ~/ 512 * 512;
  }
  return null;
}

final class _Repo {
  _Repo(this.dir);

  final String dir;

  Future<({int code, List<int> out, String err})> _run(
    List<String> args,
  ) async {
    try {
      final result = await Process.run(
        'git',
        ['-C', dir, ...args],
        environment: {'GIT_TERMINAL_PROMPT': '0'},
        stdoutEncoding: null,
      );
      return (
        code: result.exitCode,
        out: result.stdout as List<int>,
        err: (result.stderr as String).trim(),
      );
    } on ProcessException {
      throw PluginException('git plugins need git on PATH');
    }
  }

  Future<List<int>> git(List<String> args) async {
    final result = await _run(args);
    if (result.code != 0) {
      throw PluginException('git ${args.first} failed: ${result.err}');
    }
    return result.out;
  }

  Future<String?> resolve(String ref) async {
    final result = await _run([
      'rev-parse',
      '--verify',
      '--quiet',
      '--end-of-options',
      '$ref^{commit}',
    ]);
    return result.code == 0 ? utf8.decode(result.out).trim() : null;
  }

  /// Commits by version, from tags `<prefix><version>`.
  Future<Map<Version, String>> tags(String prefix) async {
    final out = await git([
      'for-each-ref',
      '--format=%(refname:strip=2) %(objectname) %(*objectname)',
      'refs/tags/$prefix*',
    ]);
    return {
      for (final line in const LineSplitter().convert(utf8.decode(out)))
        if (line.split(' ') case [final tag, final object, final peeled])
          ?_version(tag.substring(prefix.length)): peeled.isEmpty
              ? object
              : peeled,
    };
  }

  Future<DateTime> date(String commit) async {
    final out = await git(['show', '-s', '--format=%ct', commit]);
    final seconds = int.parse(utf8.decode(out).trim());
    return DateTime.fromMillisecondsSinceEpoch(seconds * 1000, isUtc: true);
  }

  /// The file at [path] in [commit], or null when it is missing.
  Future<String?> read(String commit, String path) async {
    final result = await _run(['cat-file', 'blob', '$commit:$path']);
    if (result.code != 0) return null;
    try {
      return utf8.decode(result.out);
    } on FormatException {
      throw PluginException('$path is not UTF-8 text');
    }
  }
}

Version? _version(String text) {
  try {
    return Version.parse(text);
  } on FormatException {
    return null;
  }
}
