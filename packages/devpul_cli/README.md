# devpul_cli

Command line for [DevPul](https://devpul.saradgajurel.com.np). Runs your app with the DevPul UI connected, serves the UI on 127.0.0.1 and copies plugins into apps.

## Install

```sh
dart pub global activate devpul_cli
```

This installs the `devpul` command. It runs from the pub cache, where it finds the UI build in [devpul](https://pub.dev/packages/devpul); a `dart compile exe` binary cannot.

## Usage

```sh
devpul run -d macos          # flutter run with these arguments, UI connected
devpul run bin/server.dart   # dart run outside a Flutter project, hot reload on save
devpul                       # just the UI, at http://127.0.0.1:7171
devpul add riverpod          # copy a plugin into the app
devpul create my_plugin      # start a plugin
devpul --help                # every command and flag
```

The [command line](https://devpul.saradgajurel.com.np/docs/cli/) page has every command and flag; [installing plugins](https://devpul.saradgajurel.com.np/docs/plugins/install/) and [writing plugins](https://devpul.saradgajurel.com.np/docs/plugins/) the plugin workflow.

## Limits

- The app needs the `devpul` package; see [getting started](https://devpul.saradgajurel.com.np/docs/).
- Git plugins and the `upgrade` diff need `git` on PATH.
