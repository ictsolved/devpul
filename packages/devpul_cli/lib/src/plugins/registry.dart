import 'dart:convert';

import 'package:pub_semver/pub_semver.dart';

import 'manifest.dart';

/// A plugin listed in `registry.json`, at its latest version.
typedef RegistryEntry = ({
  String id,
  Version version,
  String url,
  String? path,
});

/// The CLI reads where each plugin lives; the rest of an entry is for the
/// UI and the marketplace. Entries this version cannot read are skipped.
Map<String, RegistryEntry> parseRegistry(String text) {
  final json = jsonDecode(text);
  if (json is! Map<String, Object?> || json['format'] != 1) {
    throw const FormatException('registry.json: not format 1');
  }
  final plugins = json['plugins'];
  if (plugins is! List<Object?>) {
    throw const FormatException('registry.json: plugins needs a list');
  }
  return {
    for (final plugin in plugins)
      if (plugin case {
        'id': final String id,
        'version': final String text,
        'url': final String url,
      } when isPluginId(id))
        if (_version(text) case final version?)
          id: (
            id: id,
            version: version,
            url: url,
            path: switch (plugin['path']) {
              final String path when isPluginPath(path) => path,
              _ => null,
            },
          ),
  };
}

Version? _version(String text) {
  try {
    return Version.parse(text);
  } on FormatException {
    return null;
  }
}
