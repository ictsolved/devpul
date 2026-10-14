import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:pub_semver/pub_semver.dart';

import 'app.dart';
import 'manifest.dart';

/// Writes a plugin folder at [dir] with a JS module, Dart or both, or the
/// files missing from the plugin already there. [js] and [dart] pick the
/// halves; with neither, a new plugin gets both and an existing one keeps
/// its own. Existing files are kept, except `devpul.d.ts` and plugin.json
/// when a half is added. [devpul] is the version the new plugin targets.
/// Returns the paths written, relative to [dir].
List<String> create(
  String dir, {
  bool js = false,
  bool dart = false,
  required Version devpul,
}) {
  final manifestFile = File(p.join(dir, 'plugin.json'));
  final Map<String, Object?> json;
  final String id;
  if (manifestFile.existsSync()) {
    try {
      json =
          jsonDecode(manifestFile.readAsStringSync()) as Map<String, Object?>;
      id = Manifest.parse(json).id;
    } on Object catch (e) {
      throw PluginException(
        'plugin.json in $dir does not parse; devpul check $dir lists why '
        '(${e is ManifestException ? e.problems.first : e})',
      );
    }
  } else {
    id = p.basename(p.normalize(p.absolute(dir)));
    if (!isPluginId(id)) {
      throw PluginException(
        '$id is not a plugin id: a lowercase letter, then up to 31 '
        'lowercase letters, digits or _. Name the folder after the id.',
      );
    }
    json = {
      'id': id,
      'version': '0.1.0',
      'devpul': '^$devpul',
      'readme': 'README.md',
      'files': <String>[],
    };
    if (!js && !dart) js = dart = true;
  }

  final hasJs = json['source'] != null;
  final hasDart = json['dart'] != null;
  final name = _pascal(id);
  final label = '${id[0].toUpperCase()}${id.substring(1).replaceAll('_', ' ')}';
  final files = (json['files']! as List<Object?>).cast<String>().toList();
  final before = files.length;

  if (js && !hasJs) {
    json
      ..['api'] = pluginApi
      ..['source'] = '$id.js';
    files.add('$id.js');
    if (json['icon'] == null) {
      json['icon'] = 'icon.svg';
      files.add('icon.svg');
    }
  }
  if (dart && !hasDart) {
    json['dart'] = '$id.dart';
    files.add('$id.dart');
    json['usage'] ??= ["Devpul$name.set('count', count);"];
  }
  final source = json['source'] as String?;
  final icon = json['icon'] as String?;
  final library = json['dart'] as String?;
  json['description'] ??= source != null
      ? 'The values the app sets, in a $label tab.'
      : 'Sends $id.set events to DevPul.';
  json['files'] = files..sort();

  final written = <String>[];
  void write(String path, String text, {bool replace = false}) {
    final file = File(p.joinAll([dir, ...p.posix.split(path)]));
    if (file.existsSync() && (!replace || file.readAsStringSync() == text)) {
      return;
    }
    file
      ..parent.createSync(recursive: true)
      ..writeAsStringSync(text);
    written.add(path);
  }

  final withJs = source != null;
  final withDart = library != null;
  write('plugin.json', encodeManifest(json), replace: files.length > before);
  if (source != null) write(source, _module(id, label));
  if (icon != null) write(icon, _icon);
  if (library != null) write(library, _dart(id, name));
  if (withJs) write('devpul.d.ts', apiTypes, replace: true);
  write('README.md', _readme(id, name, label, js: withJs, dart: withDart));
  write('pubspec.yaml', _pubspec(id, devpul));
  write('example/main.dart', _example(id, name, js: withJs, dart: withDart));
  return written;
}

/// plugin.json in spec field order, one field per line.
String encodeManifest(Map<String, Object?> json) {
  String inline(Object? value) => switch (value) {
    List<Object?>() => '[${value.map(inline).join(', ')}]',
    Map<String, Object?>() when value.isEmpty => '{}',
    Map<String, Object?>() =>
      '{ ${value.entries.map((e) => '${jsonEncode(e.key)}: ${inline(e.value)}').join(', ')} }',
    _ => jsonEncode(value),
  };
  final keys = [
    ...manifestFields.where(json.containsKey),
    ...json.keys.where((key) => !manifestFields.contains(key)),
  ];
  return '{\n'
      '${keys.map((key) => '  ${jsonEncode(key)}: ${inline(json[key])}').join(',\n')}'
      '\n}\n';
}

String _pascal(String id) => [
  for (final part in id.split('_'))
    if (part.isNotEmpty) '${part[0].toUpperCase()}${part.substring(1)}',
].join();

/// Types for the plugin API, so editors check the module with no package.
const apiTypes = '''
// DevPul plugin API 1, for editors. devpul create writes it; it is not copied into apps.

/** An event the app sent with Devpul.emit. */
export interface PluginEvent {
  /** Unique per event, stable across reloads. */
  key: string;
  kind: string;
  /** The fields the app sent. */
  data: Record<string, any>;
  tags: Record<string, string>;
  /** Milliseconds since the epoch. */
  ts: number;
  session: string;
  /** One launch or hot restart of one app. */
  run: string;
}

/** Elements in the UI's own style. */
export interface PluginUi {
  /** A collapsible JSON tree. */
  json: (value: unknown) => HTMLElement;
  /** A two-column table; values that are not strings show as JSON. */
  keyValues: (values: Record<string, unknown>) => HTMLElement;
  /** A copy button. A function for `text` is read on click. */
  copy: (text: string | (() => string), label?: string) => HTMLElement;
}

export interface PluginContext {
  /** Every event the plugin matches, oldest first, current when read. */
  readonly events: PluginEvent[];
  /**
   * Calls `listener` with each batch of new matching events, oldest first.
   * Returns a function that stops it; DevPul also stops it on cleanup.
   */
  onEvents: (listener: (events: PluginEvent[]) => void) => () => void;
  /**
   * Calls a VM service method on the app. Service extensions (`ext.*`) get its isolate unless
   * `isolateId` is given. Fails while the app is paused in the debugger and after 5 s without an answer.
   */
  call: (method: string, params?: Record<string, unknown>) => Promise<any>;
  /**
   * Calls a handler the app registered with `Devpul.handle`, on the same app as `call`, and
   * resolves to its result. Rejects with the app's message, such as a `writes` handler refusing
   * while Allow writes is off.
   */
  request: (name: string, args?: Record<string, unknown>) => Promise<any>;
  /** Whether Allow writes is on. The user sets it in the Plugins tab; it is off on each load. */
  readonly writes: boolean;
  /**
   * Calls `listener` when Allow writes changes. Returns a function that stops it; DevPul also
   * stops it on cleanup.
   */
  onWritesChange: (listener: (writes: boolean) => void) => () => void;
  ui: PluginUi;
}

/** Nothing, or a function DevPul calls when the view goes away. */
export type Cleanup = void | (() => void);

export interface DevpulPlugin {
  /** The plugin API the module is written for. */
  api: 1;
  /** Unique. Registering the same id again replaces the plugin. */
  id: string;
  /** Tab name. */
  label: string;
  /** SVG markup for the tab; `stroke="currentColor"` follows the theme. Defaults to the icon file. */
  icon?: string;
  /** Event kinds the tab takes; they leave the Events tab. */
  kinds?: string[] | ((kind: string) => boolean);
  /** One line in the list. */
  summarize?: (event: PluginEvent) => string;
  /** Fills `el` for the selected event. Without it the detail shows the event as JSON. */
  render?: (el: HTMLElement, event: PluginEvent, context: PluginContext) => Cleanup;
  /** Fills the whole tab in place of the event list. */
  renderTab?: (el: HTMLElement, context: PluginContext) => Cleanup;
}

/** What a default export function receives, to register several plugins. */
export interface DevpulApi {
  api: 1;
  register: (plugin: DevpulPlugin) => void;
}
''';

String _module(String id, String label) =>
    '''
// @ts-check
// The $label tab: the latest value of each name the app sets.

/** @type {import('./devpul').DevpulPlugin} */
export default {
  api: 1,
  id: '$id',
  label: '$label',
  kinds: ['$id.set'],
  renderTab(el, context) {
    /** @type {Record<string, unknown>} */
    const values = {};
    /** @param {import('./devpul').PluginEvent[]} events */
    const apply = (events) => {
      for (const e of events) values[e.data.name] = e.data.value;
      el.replaceChildren(Object.keys(values).length ? context.ui.keyValues(values) : 'No values yet.');
    };
    apply(context.events);
    return context.onEvents(apply);
  },
};
''';

const _icon =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" '
    'stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" '
    'rx="2"/><path d="M7 8h10M7 12h10M7 16h6"/></svg>\n';

String _dart(String id, String name) =>
    '''
import 'package:devpul/devpul.dart';

/// Sends $id.set events to DevPul.
abstract final class Devpul$name {
  /// Sends [value] as the latest value of [name]. Does nothing unless
  /// [Devpul.included].
  static void set(String name, Object? value) {
    if (!Devpul.included) return;
    Devpul.emit('$id.set', {'name': name, 'value': value});
  }
}
''';

String _readme(
  String id,
  String name,
  String label, {
  required bool js,
  required bool dart,
}) =>
    '''
# $label

${js ? 'A DevPul plugin: the values the app sets, in a $label tab.' : 'A DevPul plugin that sends `$id.set` events.'}

```sh
devpul add $id
```

```dart
${dart ? "Devpul$name.set('count', count);" : "Devpul.emit('$id.set', {'name': 'count', 'value': count});"}
```
''';

String _pubspec(String id, Version devpul) =>
    '''
name: devpul_plugin_$id
description: Analyzes and runs the $id plugin in place. Not copied into apps.
publish_to: none

environment:
  sdk: ^3.8.0

dependencies:
  devpul: ^$devpul
''';

String _example(
  String id,
  String name, {
  required bool js,
  required bool dart,
}) =>
    '''
import 'dart:async';

${dart ? "import '../$id.dart';" : "import 'package:devpul/devpul.dart';"}

// Sets a value each second: devpul ${js ? '--plugin . ' : ''}run example/main.dart
void main() {
  var count = 0;
  Timer.periodic(const Duration(seconds: 1), (_) {
    ${dart ? "Devpul$name.set('count', ++count);" : "Devpul.emit('$id.set', {'name': 'count', 'value': ++count});"}
  });
}
''';
