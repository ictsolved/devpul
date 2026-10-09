# devpul_cli

Command line for [DevPul](https://devpul.saradgajurel.com.np). Serves the DevPul UI on 127.0.0.1 and runs your app with the UI connected.

## Install

```sh
dart pub global activate devpul_cli
```

This installs the `devpul` command. It runs from the pub cache, where it finds the UI build in the `devpul` package; a `dart compile exe` binary cannot.

## Usage

```sh
devpul run -d macos          # flutter run with these arguments, UI connected
devpul run bin/server.dart   # dart run outside a Flutter project
devpul                       # just the UI, at http://127.0.0.1:7171
devpul http://127.0.0.1:41234/AbCdEf12=/   # the UI connected to a running app
devpul --plugin plugin.js run   # serve a plugin to the UI, reloaded on save
```

`devpul run` keeps the terminal keys of `flutter run` (`r`, `R`, `q`) and exits with its code. A second `devpul` on the same port hands its app to the tab the first one opened. The UI stays on port 7171 so settings and history persist; `--port` picks another, `--no-open` prints links instead of opening a browser.

## Limits

- The app needs the `devpul` package; see [getting started](https://devpul.saradgajurel.com.np/docs/).
- Control requests between devpul processes need a per-process token and a loopback Host header.
