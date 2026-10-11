---
title: Plugin format
description: The DevPul plugin folder and plugin.json, the vendored copy and devpul.lock in an app, the generated lib/devpul/plugins.dart, and registry.json.
---

A plugin is a folder with a `plugin.json` and an ES module for a tab in the UI, Dart for the app, or both. An app copies the folder into `lib/devpul/<id>/`, records it in `devpul.lock` and calls `DevpulPlugins.install()` from the generated `lib/devpul/plugins.dart`, which offers every plugin to the UI with [`Devpul.plugin`](/docs/plugins/#shipping-a-plugin) in debug builds.

## Plugin folder

```
cart/
  plugin.json
  cart.js       ES module the UI runs
  cart.dart     Dart the app calls
  icon.svg      tab icon, optional
  README.md
  example/      optional, never copied
```

`devpul create cart` writes this layout with a `pubspec.yaml` for working on the Dart in place and `devpul.d.ts` with the plugin API types; neither is copied. `devpul check` validates a folder the way `devpul add` and the registry do.

## plugin.json

```json
{
  "id": "cart",
  "version": "1.2.0",
  "api": 1,
  "devpul": "^1.0.0",
  "description": "Cart contents and totals in a Cart tab.",
  "tags": ["shop", "state"],
  "icon": "icon.svg",
  "readme": "README.md",
  "usage": ["DevpulCart.changed(items, total);"],
  "requires": { "collection": "^1.18.0" },
  "source": "cart.js",
  "dart": "cart.dart",
  "files": ["cart.dart", "cart.js", "icon.svg"]
}
```

| Field         | Required      | Value                                                                                                                       |
| ------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `id`          | yes           | A lowercase letter, then up to 31 lowercase letters, digits or `_`.                                                         |
| `version`     | yes           | A semantic version, such as `1.2.0` or `2.0.0-dev.1`.                                                                       |
| `api`         | with `source` | `1`, the [plugin API](/docs/plugins/#api) the module is written for.                                                        |
| `devpul`      | yes           | A pub version constraint on the `devpul` package the app uses.                                                              |
| `description` | yes           | One line, up to 160 characters: what the plugin shows. In the marketplace and the UI's Plugins tab.                         |
| `tags`        |               | Up to 5, each up to 20 lowercase letters, digits or `-`.                                                                    |
| `icon`        |               | An SVG file in `files`, shown as the tab icon. Only with `source`.                                                          |
| `readme`      |               | A file in the folder, shown in the registry. Not copied unless it is in `files`.                                            |
| `usage`       |               | 1 to 3 lines of wiring the app adds by hand, up to 100 characters each.                                                     |
| `requires`    |               | Packages the Dart imports besides `devpul`, with pub version constraints. The app depends on them itself.                   |
| `source`      |               | The ES module, a `.js` file in `files`, up to 512 KB with the icon. A plugin has `source`, `dart` or both.                  |
| `dart`        |               | A `.dart` library in `files`, exported by the generated file.                                                               |
| `files`       | yes           | Every file copied into the app besides `plugin.json`: relative paths with `/`, no `.` or `..` segments and no hidden files. |

Other fields are rejected.

The id names the folder, the `Devpul.plugin` id the UI keeps approvals for, and the plugin's git tags: `<id>-v<version>`, such as `cart-v1.2.0`.

### Module

The module follows the [plugin API](/docs/plugins/#api): one file with a default export and no imports. It does not export a name `icon`: the generated file appends `export const icon = "<svg ...>"` with the icon file, and the UI uses it for each tab that sets no icon.

### Dart

The generated file exports every plugin's `dart` library into one namespace, so public names start with `Devpul<Id>` or `devpul<Id>`, such as `DevpulCart`. The Dart imports `package:devpul`, the packages in `requires` and its own files in `files`.

A plugin with only Dart adds no tab. It sends events to the built-in tabs, as an adapter for another HTTP client would for Network, and its events show in Events.

Code the app calls in every build, such as an observer in `main`, does nothing unless [`Devpul.included`](/docs/api/#profile-builds), a constant, so the compiler drops the plugin from release builds and from profile builds that do not opt in.

## In the app

```
devpul.lock
lib/devpul/
  plugins.dart  generated
  cart/         copied, committed
    plugin.json
    cart.dart
    cart.js
    icon.svg
```

Everything is committed, so plugin code shows up in the app's diffs and builds need no network or cache.

```dart
import 'devpul/plugins.dart';

void main() {
  DevpulPlugins.install();
  runApp(const App());
}
```

### devpul.lock

```json
{
  "format": 1,
  "plugins": {
    "cart": {
      "url": "https://example.com/plugins.git",
      "path": "cart",
      "constraint": "^1.2.0",
      "commit": "0123456789abcdef0123456789abcdef01234567",
      "version": "1.2.0",
      "hash": "abaf05812a3ec7f4b4f17a0d801d5175808b3b6a5847e3fcbabc032641328f4e"
    },
    "flags": {
      "url": "https://example.com/flags/plugin.json",
      "version": "0.3.1",
      "hash": "9adea98c93e0d8a2d88dfff7a850d1dd6764b3d1530699657bedaba0f9d96a4a"
    }
  }
}
```

| Field        |                                                                                               |
| ------------ | --------------------------------------------------------------------------------------------- |
| `format`     | `1`.                                                                                          |
| `plugins`    | By id, sorted.                                                                                |
| `url`        | A git repository, a `plugin.json` URL, or a folder path relative to the app.                  |
| `path`       | The plugin folder inside a git repository.                                                    |
| `ref`        | The git ref the plugin is pinned to.                                                          |
| `constraint` | The versions an update may move to, read from the `<id>-v<version>` tags.                     |
| `commit`     | The resolved git commit.                                                                      |
| `version`    | The copied version.                                                                           |
| `hash`       | SHA-256 of the copied folder: `sha256sum` lines of its files sorted by path, CRLF read as LF. |

The hash can be checked by hand:

```sh
cd lib/devpul/cart
find . -type f | sed 's|^\./||' | LC_ALL=C sort | xargs sha256sum | sha256sum
```

### lib/devpul/plugins.dart

```dart
// Generated by devpul from devpul.lock. Do not edit.
//
// cart 1.2.0 from https://example.com/plugins.git
//   DevpulCart.changed(items, total);

// dart format off
// ignore_for_file: type=lint

import 'package:devpul/devpul.dart';

export 'cart/cart.dart';

abstract final class DevpulPlugins {
  static void install() {
    if (!Devpul.included) return;
    Devpul.plugin(
      'cart',
      () => r'''
export default { ... };
export const icon = "<svg ...>";
''',
      version: '1.2.0',
      origin: 'https://example.com/plugins.git',
      description: 'Cart contents and totals in a Cart tab.',
    );
  }
}
```

The file is written whole from `devpul.lock` and the copied files, so it is never edited. Each plugin's `usage` is in the header. A plugin with no `source` is exported and not offered. The handshake lists `origin`, the lock's `url`, and the manifest's `description`.

- Not named `.g.dart`, so ignore rules for build_runner output leave it committed.
- `// dart format off` keeps it the same under any formatter settings.
- `Devpul.included` is false when `dart.vm.product` is set, and when `dart.vm.profile` is set without `DEVPUL_PROFILE` or on the web. Those are the constants behind Flutter's `kReleaseMode` and `kProfileMode`, so release builds and profile builds that do not opt in drop every plugin on every platform, and so does `dart compile exe`. `dart compile js` sets neither; pass `-Ddart.vm.product=true`.

## registry.json

Served at `%SITE_URL%plugins/registry.json`, next to the [plugins page](/plugins/). One entry per plugin at its latest version. `url` and `path` are what a lock entry records for a plugin installed from it. Check for updates in the UI's Plugins tab matches an entry by `id` and by `url` against the handshake `origin`.

The registry is built from the `<id>-v<version>` tags of the plugins in the DevPul repository and the entries in its `registry/third-party.json`, each fetched as `devpul add <id>` would fetch it and checked as `devpul check` checks a folder. A third-party entry is an `id` and an https `url`: a git repository with `<id>-v<version>` tags, plus `path` for the plugin folder in it, or a `plugin.json` URL. The README is shown on the plugin's page as markdown without HTML; images show as links.

```json
{
  "format": 1,
  "plugins": [
    {
      "id": "cart",
      "version": "1.3.0",
      "api": 1,
      "devpul": "^1.0.0",
      "description": "Cart contents and totals in a Cart tab.",
      "tags": ["shop", "state"],
      "icon": "<svg ...>",
      "usage": ["DevpulCart.changed(items, total);"],
      "requires": {},
      "url": "https://example.com/plugins.git",
      "path": "cart"
    }
  ]
}
```
