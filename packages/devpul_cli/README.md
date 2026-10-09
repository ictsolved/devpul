# devpul_cli

Command line for [DevPul](https://devpul.saradgajurel.com.np). Serves the DevPul UI on 127.0.0.1, runs your app with the UI connected and copies plugins into it.

## Install

```sh
dart pub global activate devpul_cli
```

This installs the `devpul` command. It runs from the pub cache, where it finds the UI build in the `devpul` package; a `dart compile exe` binary cannot.

## Usage

```sh
devpul run -d macos          # flutter run with these arguments, UI connected
devpul run bin/server.dart   # dart run outside a Flutter project, hot reload on save
devpul                       # just the UI, at http://127.0.0.1:7171
devpul http://127.0.0.1:41234/AbCdEf12=/   # the UI connected to a running app
devpul --plugin plugin.js run   # serve a plugin to the UI, reloaded on save
```

Plugins, in the app root:

```sh
devpul add riverpod                       # from the registry, latest version
devpul add https://example.com/plugins.git@^1.2.0 --path cart
devpul add https://example.com/plugins.git#main --path cart
devpul add https://example.com/flags/plugin.json
devpul add ../plugins/cart                # a folder, for plugin development
devpul remove cart
devpul list
devpul sync                               # rewrite lib/devpul/plugins.dart, offline
devpul sync --check                       # in CI: exit 1 when it is stale
devpul cache clean
```

`add` copies the plugin into `lib/devpul/<id>/`, records it in `devpul.lock` and writes `lib/devpul/plugins.dart`; commit all three and call `DevpulPlugins.install()` in `main`. Git versions come from `<id>-v<version>` tags; `@` takes a pub version constraint, `#` a branch, tag or commit. A plugin that needs a package the app lacks stops `add` with the `pub add` command; `--yes` runs it. `add` will not overwrite a vendored copy with local edits. `sync` copies a plugin added from a folder again when the folder changed, so `sync --check` also fails when the copy is behind.

`devpul run` keeps the terminal keys of `flutter run` (`r`, `R`, `q`) and exits with its code. A `dart run` app hot reloads when a `.dart` file in the folder is saved. A second `devpul` on the same port hands its app to the tab the first one opened. The UI stays on port 7171 so settings and history persist; `--port` picks another, `--no-open` prints links instead of opening a browser.

## Limits

- The app needs the `devpul` package; see [getting started](https://devpul.saradgajurel.com.np/docs/).
- Git plugins need `git` on PATH. Mirrors are kept in the user cache directory (`~/.cache/devpul/git` on Linux).
- Control requests between devpul processes need a per-process token and a loopback Host header.
