import 'package:pub_semver/pub_semver.dart';

/// The plugin API the UI implements.
const pluginApi = 1;

final _id = RegExp(r'^[a-z][a-z0-9_]{0,31}$');
final _tag = RegExp(r'^[a-z0-9][a-z0-9-]{0,19}$');
final _package = RegExp(r'^[a-z_][a-z0-9_]*$');
final _segment = RegExp(r'^[A-Za-z0-9_][A-Za-z0-9._-]*$');

/// A lowercase letter, then up to 31 lowercase letters, digits or `_`.
bool isPluginId(String id) => _id.hasMatch(id);

bool isPackageName(String name) => _package.hasMatch(name);

bool isTag(String tag) => _tag.hasMatch(tag);

/// Relative, `/` separated, with no empty, `.`, `..` or hidden segments.
bool isPluginPath(String path) => path.split('/').every(_segment.hasMatch);

/// plugin.json fields in the order the spec lists them.
const manifestFields = [
  'id',
  'version',
  'api',
  'devpul',
  'description',
  'tags',
  'icon',
  'readme',
  'usage',
  'requires',
  'source',
  'dart',
  'files',
];

/// A plugin's `plugin.json`.
final class Manifest {
  Manifest._({
    required this.id,
    required this.version,
    required this.devpul,
    required this.description,
    required this.tags,
    required this.icon,
    required this.readme,
    required this.usage,
    required this.requires,
    required this.source,
    required this.dart,
    required this.files,
    required this.unknown,
  });

  /// Throws a [ManifestException] with every problem in [json].
  factory Manifest.parse(Object? json) {
    if (json is! Map<String, Object?>) {
      throw ManifestException(['not a JSON object']);
    }
    final problems = <String>[];
    void problem(String key, String message) => problems.add('$key: $message');

    T? read<T>(String key, String type, {bool required = true}) {
      final value = json[key];
      if (value is T) return value;
      if (value != null || required) problem(key, 'needs $type');
      return null;
    }

    List<String>? strings(String key, {bool required = true}) {
      final list = read<List<Object?>>(
        key,
        'a list of strings',
        required: required,
      );
      if (list == null) return null;
      if (list.every((v) => v is String)) return list.cast<String>();
      problem(key, 'needs a list of strings');
      return null;
    }

    T? parse<T>(String key, T Function(String) parser) {
      final text = read<String>(key, 'a string');
      if (text == null) return null;
      try {
        return parser(text);
      } on FormatException {
        problem(key, '"$text" does not parse');
        return null;
      }
    }

    final id = read<String>('id', 'a string');
    if (id != null && !isPluginId(id)) {
      problem(
        'id',
        'a lowercase letter, then up to 31 lowercase letters, digits or _',
      );
    }

    final version = parse('version', Version.parse);

    final devpul = parse('devpul', VersionConstraint.parse);
    if (devpul != null && devpul.isEmpty) {
      problem('devpul', 'allows no version');
    }

    final description = read<String>('description', 'a string');
    if (description != null &&
        (description.trim().isEmpty ||
            description.length > 160 ||
            description.contains('\n'))) {
      problem('description', 'one line of 1 to 160 characters');
    }

    final tags = strings('tags', required: false) ?? const [];
    if (tags.length > 5) problem('tags', 'at most 5');
    for (final tag in tags) {
      if (!isTag(tag)) {
        problem('tags', '"$tag": up to 20 lowercase letters, digits or -');
      }
    }

    final usage = strings('usage', required: false) ?? const [];
    if (json.containsKey('usage') && (usage.isEmpty || usage.length > 3)) {
      problem('usage', '1 to 3 lines');
    }
    for (final line in usage) {
      if (line.trim().isEmpty || line.contains('\n') || line.length > 100) {
        problem('usage', 'each line holds 1 to 100 characters');
      }
    }

    final requires = <String, VersionConstraint>{};
    final packages = read<Map<String, Object?>>(
      'requires',
      'an object of package constraints',
      required: false,
    );
    for (final MapEntry(:key, :value) in (packages ?? const {}).entries) {
      if (!_package.hasMatch(key) || key == 'devpul') {
        problem('requires', '"$key" is not a package other than devpul');
      } else if (value is! String) {
        problem('requires', '$key needs a version constraint string');
      } else {
        try {
          requires[key] = VersionConstraint.parse(value);
        } on FormatException {
          problem('requires', '$key: "$value" does not parse');
        }
      }
    }

    final files = strings('files') ?? const [];
    if (json.containsKey('files') && files.isEmpty) {
      problem('files', 'at least the source or the Dart');
    }
    for (final file in files) {
      if (!isPluginPath(file)) problem('files', '"$file" is not a plain path');
      if (file == 'plugin.json') problem('files', 'plugin.json is implied');
    }
    if (files.toSet().length != files.length) problem('files', 'duplicates');

    String? listed(String key, String extension, {bool required = false}) {
      final path = read<String>(key, 'a path', required: required);
      if (path == null) return null;
      if (!path.endsWith(extension)) problem(key, 'needs a $extension file');
      if (!files.contains(path)) problem(key, '$path is not in files');
      return path;
    }

    final source = listed('source', '.js');
    final dart = listed('dart', '.dart');
    if (json['source'] == null && json['dart'] == null) {
      problem('source', 'needs source, dart or both');
    }

    // The plugin API and the icon are the module's.
    if (json['source'] != null) {
      final api = read<int>('api', 'an integer');
      if (api != null && api != pluginApi) {
        problem('api', 'this devpul supports plugin API $pluginApi, not $api');
      }
    } else {
      if (json['api'] != null) problem('api', 'only with a source');
      if (json['icon'] != null) problem('icon', 'only with a source');
    }
    final icon = listed('icon', '.svg');

    final readme = read<String>('readme', 'a path', required: false);
    if (readme != null && !isPluginPath(readme)) {
      problem('readme', '"$readme" is not a plain path');
    }

    if (problems.isNotEmpty) throw ManifestException(problems);
    return Manifest._(
      id: id!,
      version: version!,
      devpul: devpul!,
      description: description!,
      tags: tags,
      icon: icon,
      readme: readme,
      usage: usage,
      requires: requires,
      source: source,
      dart: dart,
      files: files,
      unknown: [
        for (final key in json.keys)
          if (!manifestFields.contains(key)) key,
      ],
    );
  }

  final String id;
  final Version version;

  /// The `devpul` versions the plugin works with.
  final VersionConstraint devpul;
  final String description;
  final List<String> tags;

  /// SVG file, embedded into the source as the tab icon.
  final String? icon;
  final String? readme;

  /// Wiring the app adds by hand, shown after install.
  final List<String> usage;

  /// Packages the plugin's Dart imports, besides `devpul`.
  final Map<String, VersionConstraint> requires;

  /// The ES module the UI runs. Null for a plugin that sends events to the
  /// built-in tabs only.
  final String? source;

  /// The library the generated file exports.
  final String? dart;

  /// Every file copied into the app besides `plugin.json`.
  final List<String> files;

  /// Fields this version does not know. `check` and the registry reject
  /// them; `add`, `sync` and `upgrade` warn, so a plugin written for a later
  /// devpul still installs.
  final List<String> unknown;
}

final class ManifestException implements Exception {
  ManifestException(this.problems);

  final List<String> problems;

  @override
  String toString() => 'plugin.json: ${problems.join('; ')}';
}
