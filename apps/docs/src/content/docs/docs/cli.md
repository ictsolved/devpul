---
title: Command line
description: Every devpul command and flag - serving the UI, devpul run, connecting to a VM service URL, and the plugin commands add, remove, list, sync, outdated, upgrade, update, cache clean, create and check.
---

```sh
dart pub global activate devpul_cli
```

This installs the `devpul` command from [devpul_cli](https://pub.dev/packages/devpul_cli). It runs from the pub cache, where it finds the UI build in the `devpul` package; a `dart compile exe` binary cannot. `devpul --help` prints the summary below; `-h` and `--help` work after any command too.

```text
devpul [options] [vm-service-url]
devpul [options] run [flutter run or dart run arguments]
devpul add <plugin>[@version|#ref] [--path <dir>] [--yes]
devpul remove <id>
devpul list
devpul sync [--check]
devpul outdated [--exit-code]
devpul upgrade [id] [--major-versions] [--yes]
devpul update
devpul cache clean
devpul create <dir> [--js] [--dart]
devpul check [dir]
```

## devpul

```sh
devpul                                     # serve the UI and open it
devpul http://127.0.0.1:41234/AbCdEf12=/   # open it connected to a running app
```

Serves the UI on `http://127.0.0.1:7171` until stopped with Ctrl+C. With a VM service URL, the UI opens connected to that app.

| Option            |                                                                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>`      | The UI port, 7171 by default. Settings and history are kept per port, since each is its own browser origin. Without it, a port taken by another program moves to the next free one, up to 7190. |
| `--no-open`       | Print links and open no browser.                                                                                                                                                                |
| `--plugin <path>` | Serve a plugin module file or plugin folder to the UI, loaded again on each save. Repeat it for several. See [Writing plugins](/docs/plugins/#developing-a-plugin).                             |
| `-h`, `--help`    | Print usage.                                                                                                                                                                                    |

A devpul that finds another devpul on its port hands its app to that one's tab and serves nothing itself, so one tab follows every app you start. `--plugin` needs its own server: stop the other one or pass `--port`.

The server listens on `127.0.0.1` only and answers only requests whose `Host` is a loopback name. A later devpul hands over its app with a token from the user cache directory, which only your user can read.

## devpul run

```sh
devpul run -d macos              # flutter run with these arguments
devpul run --profile -d macos    # a profile build with DevPul kept in
devpul run bin/server.dart       # dart run outside a Flutter project
devpul --port 7272 run -d linux  # options before run
```

Runs `flutter run` with the arguments after `run`, in a folder whose `pubspec.yaml` depends on the Flutter SDK, and `dart run` anywhere else. Once the app is up, DevPul opens connected to it, and the app's [printed link](/docs/connecting/#the-printed-link) points at this server. devpul's own options go before `run`; everything after it goes to the tool.

- `flutter run` keeps its terminal keys (`r`, `R`, `q`), and DevPul gets **Reload** and **Restart** buttons. `--profile` adds `--dart-define=DEVPUL_PROFILE=true`; see [profile builds](/docs/api/#profile-builds).
- `dart run` gets a VM service on a free port and hot reloads each time a `.dart` file in the folder is saved.
- devpul exits with the tool's exit code.

## Plugins

Run in the app root, the folder with `pubspec.yaml`. [Installing plugins](/docs/plugins/install/) walks through them.

### add

```sh
devpul add riverpod                                     # listed on the plugins page
devpul add cart@^1.2.0                                  # a pub version constraint
devpul add https://example.com/plugins.git --path cart  # a git repository
devpul add https://example.com/plugins.git#main --path cart
devpul add https://example.com/flags/plugin.json        # a plugin.json over https
devpul add ../plugins/cart                              # a folder
```

Copies a plugin into `lib/devpul/<id>/`, records it in `devpul.lock` and writes `lib/devpul/plugins.dart`. `@version` takes a pub version constraint, `#ref` a git branch, tag or commit.

| Option         |                                                                            |
| -------------- | -------------------------------------------------------------------------- |
| `--path <dir>` | The plugin folder in a git repository, when it is not the root.            |
| `--yes`        | Run the `dart pub add` or `flutter pub add` a plugin needs without asking. |

### remove

`devpul remove <id>` deletes the plugin's folder and lock entry and writes `plugins.dart` again.

### list

`devpul list` prints each plugin in `devpul.lock` with its version and source, and marks copies with local edits.

### sync

`devpul sync` writes `lib/devpul/plugins.dart` from `devpul.lock`, offline, and copies plugins added from a folder again when the folder changed.

| Option    |                                                                      |
| --------- | -------------------------------------------------------------------- |
| `--check` | Write nothing; exit 1 when `plugins.dart` or a folder copy is stale. |

### outdated

`devpul outdated` lists each plugin's current version, the newest its constraint allows and the latest, and `devpul_cli` against pub.dev. A source it cannot reach prints why and does not fail the command.

| Option        |                                 |
| ------------- | ------------------------------- |
| `--exit-code` | Exit 1 when anything is behind. |

### upgrade

`devpul upgrade [id]` moves one plugin, or all, to the newest version the constraint allows, then writes `plugins.dart`. It shows a `git diff` of the copied files and asks first; without a terminal and without `--yes` it prints the diff and writes nothing. Refs move to their current commit, folders and `plugin.json` URLs to their current contents.

| Option             |                                                                              |
| ------------------ | ---------------------------------------------------------------------------- |
| `--major-versions` | Take the latest version, rewriting the constraint when it does not allow it. |
| `--yes`            | Write without the diff and run the `pub add` a plugin needs.                 |

### update

`devpul update` updates devpul itself: `dart pub global activate devpul_cli` with the SDK that runs it.

### cache clean

`devpul cache clean` deletes the git mirrors of plugin repositories.

## Plugin authoring

### create

```sh
devpul create my_plugin          # JS module, Dart and an example app
devpul create --dart my_plugin   # add the Dart half to an existing folder
```

Writes a plugin folder named after the plugin id, or the files missing from one. A new plugin gets both halves unless one is picked; an existing one gets the picked half added. See [Writing plugins](/docs/plugins/#developing-a-plugin).

| Option   |                                        |
| -------- | -------------------------------------- |
| `--js`   | A JS module for a tab.                 |
| `--dart` | Dart for the app, such as an observer. |

### check

`devpul check [dir]` validates a plugin folder, the current one by default, the way `add` and the registry do, and exits 1 on any problem.

## Exit codes

| Code | When                                                                      |
| ---- | ------------------------------------------------------------------------- |
| 0    | Done.                                                                     |
| 1    | A command failed, a check found problems, or `--exit-code` found updates. |
| 64   | Wrong arguments; the usage follows the message.                           |

`devpul run` exits with the code of `flutter run` or `dart run`.

## Files

| Path                                                                                               |                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `~/.cache/devpul` on Linux, `~/Library/Caches/devpul` on macOS, `%LOCALAPPDATA%\devpul` on Windows | The port and token of each serving devpul, and git mirrors of plugin repositories. `$XDG_CACHE_HOME` moves it on Linux. |

Git plugins and the `upgrade` diff need `git` on PATH.
