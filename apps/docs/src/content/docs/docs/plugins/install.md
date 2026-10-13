---
title: Installing plugins
description: Copy DevPul plugins into an app with devpul add, wire them in main, upgrade them, and check them in CI with devpul sync --check and devpul outdated.
---

A plugin is copied into the app, not added as a dependency. `devpul add` puts its files in `lib/devpul/<id>/`, records where they came from in `devpul.lock` and writes `lib/devpul/plugins.dart`. Commit all three: builds need no network, and plugin code shows up in the app's diffs.

<img class="dark:sl-hidden" src="/screenshots/sqlite-light.webp" alt="The SQLite tab of the sqflite plugin showing the products table of the app's database" width="1440" height="900" loading="lazy" />
<img class="light:sl-hidden" src="/screenshots/sqlite-dark.webp" alt="The SQLite tab of the sqflite plugin showing the products table of the app's database" width="1440" height="900" loading="lazy" />

The commands come with `devpul_cli` and run in the app root, the folder with `pubspec.yaml`:

```sh
dart pub global activate devpul_cli
```

## Add a plugin

```sh
devpul add riverpod
```

`add` prints the files it copies with their SHA-256, then the lines to add by hand. Call `DevpulPlugins.install()` once in `main`, plus the wiring each plugin prints:

```dart
import 'devpul/plugins.dart';

void main() {
  DevpulFlutter.install();
  DevpulPlugins.install();
  runApp(ProviderScope(observers: devpulRiverpodObservers(), child: const App()));
}
```

The next time DevPul connects, it offers the plugin's tab. Allow it once; see [Approvals](#approvals).

Before writing anything, `add` checks the plugin's `devpul` range against the app's `devpul` version and its `requires` against the app's packages. A missing package or a version outside the constraint stops it with the `dart pub add` or `flutter pub add` command; in a terminal it asks to run it, and `--yes` runs it. Run `pub get` first, since `add` reads the resolved packages.

The [Dio](/docs/dio/) and [package:http](/docs/http/) adapters are pub packages the plugins page lists by name: `devpul add dio` and `devpul add http` run `pub add` for them and copy nothing.

## Approvals

When an app offers a plugin, DevPul shows its id, version, description and source size in the Plugins tab and above the other tabs, and runs it only after you allow it. An approval covers one id at one SHA-256, so a changed plugin asks again. Approvals are kept per browser origin; see [Limits](/docs/limits/#one-store-per-origin).

Approved sources are kept in the browser, so a plugin loads before the app is asked for anything, and with stored or opened sessions when the app is gone. The handshake carries each source's SHA-256; when it matches an approved source DevPul keeps, the app is not asked for the source at all. That hash only picks among sources you already allowed for the id; a source the app sends is hashed by DevPul itself. Sources larger than 512 KB are refused.

The Plugins tab lists approvals with icon, id, version, description and a link to an http(s) source; hovering shows the origin on the id and the hash on the version. Switch one off to stop loading it, or remove it.

<img class="dark:sl-hidden" src="/screenshots/plugins-light.webp" alt="The Plugins tab listing the riverpod and sqflite plugins, the Allow writes switch and module URLs" width="1440" height="900" loading="lazy" />
<img class="light:sl-hidden" src="/screenshots/plugins-dark.webp" alt="The Plugins tab listing the riverpod and sqflite plugins, the Allow writes switch and module URLs" width="1440" height="900" loading="lazy" />

**Check for updates** there fetches the registry's `registry.json`, only on that click, and shows the latest version of each plugin listed with the same id and source, with the `devpul upgrade` command. Other plugins show "Can't check"; `devpul outdated` in the app checks every source.

## Sources

| Argument                                      | Source                                                                      |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `riverpod`                                    | Listed on the [plugins page](/plugins/): its git repository and folder.     |
| `https://example.com/plugins.git --path cart` | A git repository; `--path` names the plugin folder when it is not the root. |
| `https://example.com/flags/plugin.json`       | A `plugin.json` over https, with its files next to it.                      |
| `../plugins/cart`                             | A folder, for plugin development.                                           |

Git versions come from `<id>-v<version>` tags, such as `cart-v1.2.0`. Without a version `add` takes the newest tag and records `^<version>`. A name or git URL takes a version or a ref:

```sh
devpul add cart@^1.2.0                # a pub version constraint; @1.2.0 is exact
devpul add cart#main                  # a branch, tag or commit, pinned to its commit
```

The lock records the git URL, never the registry, so `outdated` and `upgrade` work with the repository alone. A folder is recorded relative to the app; `sync` copies it again when it changes. A `plugin.json` URL has no versions: `upgrade` takes what it serves.

## Keep plugins current

```sh
devpul list                     # id, version, source; edited copies are marked
devpul outdated                 # current, upgradable and latest versions, and devpul_cli
devpul upgrade                  # every plugin, within its constraint
devpul upgrade cart --major-versions   # breaking versions; rewrites the constraint
devpul remove cart
devpul sync                     # rewrite lib/devpul/plugins.dart from the lock, offline
devpul update                   # devpul itself
devpul cache clean              # drop the git mirrors in the user cache
```

`upgrade` shows a `git diff` of the copied files and asks before writing; `--yes` writes without asking. Without a terminal and without `--yes` it prints the diff and writes nothing. It runs the same version and package checks as `add`. Pinned refs move to the ref's current commit.

`remove` deletes the copy and the lock entry and rewrites `plugins.dart`; the wiring line in `main` is yours to remove. With no plugins left, `DevpulPlugins.install()` stays and does nothing.

Nothing checks for updates outside these commands. DevPul's Plugins tab has a [Check for updates](#approvals) button for listed plugins.

## Edited copies

The copy is the app's code, and edits to it are kept. `list` marks an edited plugin, `sync` warns about it, and `add` and `upgrade` refuse to overwrite it: `devpul remove <id>` drops the edits. For a plugin added from a folder, make edits in the folder.

## In CI

```sh
dart pub global activate devpul_cli
devpul sync --check             # exit 1 when plugins.dart is stale or a folder copy is behind
devpul outdated --exit-code     # exit 1 when a plugin or devpul_cli is behind
```

`sync --check` needs no network. `outdated` fetches tags and manifests; a source it cannot reach prints why and does not fail the command.

## Release builds

`DevpulPlugins.install()` returns at once unless [`Devpul.included`](/docs/api/#profile-builds), a constant, so the compiler drops every plugin's source and Dart from release builds and from profile builds that do not opt in. DevPul's own CI builds an app for release and checks that no plugin source and no `ext.devpul` service extension is left in the output.

## Security

Plugin code is in the app's repository, so it is reviewed in diffs like any other code; `upgrade` shows the diff before writing. The UI still asks before it runs a plugin's module, once per id and SHA-256, and a changed module asks again. A plugin runs with full access to the DevPul page; add only plugins from sources you trust.
