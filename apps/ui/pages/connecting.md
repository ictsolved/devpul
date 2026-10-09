---
title: Connecting
description: Connect DevPul to flutter run, dart run, flutter attach, Flutter web and IDE debug sessions, with devpul run, the printed link, DevTools, a pasted URL or a fixed port.
---

# Connecting

DevPul connects to the Dart Development Service (DDS) of a debug run. It needs the VM service URL, which changes on every run unless you fix it.

## Command line

```sh
dart pub global activate devpul_cli
devpul run -d macos
```

`devpul run` runs `flutter run` with the arguments you give it, or `dart run` outside a Flutter project, and opens DevPul on `http://127.0.0.1:7171` connected to the app once it is up. The terminal keys of `flutter run` keep working, and DevPul gets **Reload** and **Restart** buttons. A `dart run` app hot reloads each time you save a `.dart` file in the folder.

A second `devpul run`, or `devpul <vm-service-url>`, hands its app to the tab that is already open. The port stays the same so settings and history persist; `--port` picks another and `--no-open` prints links instead of opening a browser. `devpul` alone serves the UI.

## The printed link

At startup the app prints a link that opens DevPul connected to it:

```text
DevPul %SITE_URL%#connect=http%3A%2F%2F127.0.0.1%3A41234%2FAbCdEf12%3D%2F
```

Click it in the terminal or the IDE's debug console. It works for any run, IDE runs included, and prints again when the URL changes, as after a `flutter attach`. Set [`uiUrl`](%ROOT%docs/api/#configuration) to link to another copy of DevPul, or `null` to turn it off. Flutter web prints no link.

## In DevTools and the IDE

The `devpul` package ships DevPul as a DevTools extension. Open DevTools for a debug run, from the browser link `flutter run` prints or from the IDE, and enable DevPul once per project when asked; DevTools writes the choice to `devtools_options.yaml`. DevPul then sits in the DevTools tabs, or in the overflow menu, already connected to the app DevTools is connected to.

In VS Code, the Flutter sidebar lists it under "DevTools Extensions". Settings, history and plugin approvals are kept per DevTools server: the IDE keeps one per session, while DevTools opened from a `flutter run` link gets a new one every run.

## Paste the URL

Any of these work:

- the `http://127.0.0.1:PORT/TOKEN=/` line from `flutter run` or `dart run --enable-vm-service`
- a DevTools link that contains `?uri=...`
- a `ws://127.0.0.1:PORT/TOKEN=/ws` URL

Paste it into the field, or anywhere on the page outside a text field.

Where to find it:

| Tool                           | Where                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `flutter run`                  | "A Dart VM Service on ... is available at:"                                                       |
| `dart run --enable-vm-service` | "The Dart VM service is listening on"                                                             |
| VS Code                        | Debug Console, the "Connecting to VM Service at" line, or the command "Dart: Copy VM Service URL" |
| Android Studio, IntelliJ       | Run tool window, the VM service line                                                              |

## Restarts and stale URLs

Hot reload and hot restart keep the URL. A full restart gets a new port and token. Paste the new URL and DevPul replaces the old one: a saved URL with a token that is not connected belongs to a run that ended. URLs that are still connected stay, so you can watch several apps at once.

A hot restart or a replaced URL also drops that app's older events. With **Keep earlier runs** in Settings, earlier runs stay and show as separate run chips.

## Open DevPul already connected

Add the URL after `#connect=`:

```text
%SITE_URL%#connect=http://127.0.0.1:41234/AbCdEf12=/
```

Any site can link here, so a link connects only to this machine: `localhost`, `127.0.0.0/8` or `[::1]`. DevPul ignores a link to any other host and says so. Pasting a URL works for any host.

`devpul <vm-service-url>` opens that link for you.

## Paused in the debugger

While the app is stopped at a breakpoint, its connection shows **paused** and DevPul sends it nothing: actions, plugin calls and limit changes are disabled, since the app would run them only on resume. DevPul fetches what it missed once the app resumes. A call the running app does not answer within 5 s fails with an error.

## Fixed port (optional)

Run with a fixed DDS port and no token, then paste `127.0.0.1:8181` once. DevPul keeps the URL, so the connection survives restarts.

```sh
flutter run --dds-port=8181 --disable-service-auth-codes
```

VS Code, for every run in `settings.json`:

```json
"dart.flutterRunAdditionalArgs": ["--dds-port=8181", "--disable-service-auth-codes"]
```

Or as a launch configuration in `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Flutter (DevPul)",
      "type": "dart",
      "request": "launch",
      "program": "lib/main.dart",
      "toolArgs": ["--dds-port=8181", "--disable-service-auth-codes"]
    }
  ]
}
```

Android Studio: add the same flags under Run > Edit Configurations > Additional run args.

> Without the token, any local process and any web page open in your browser can connect to the debug service while the app runs. Use it on machines you trust.

## Runs and platforms

| Run                                    | Notes                                                                                                                                                                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flutter run` on Android, iOS, desktop | Full support. Devices are forwarded to `127.0.0.1` by flutter tools.                                                                                                                                                                     |
| `flutter attach`                       | Always uses a token. Events from before the attach come from the app's own backlog.                                                                                                                                                      |
| Flutter web                            | Always uses a token. Flutter web does not report uncaught async errors to `PlatformDispatcher.onError` ([flutter#100277](https://github.com/flutter/flutter/issues/100277)); wrap `runApp` in `runZonedGuarded` and call `Devpul.error`. |
| Plain Dart                             | `dart run --enable-vm-service`. Avoid `--observe`: it pauses isolates on exit, which stalls `Isolate.run` and Dio's background JSON decoding.                                                                                            |

## Hosted or local

| Where        | How                 | Notes                                                                                                                                            |
| ------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Hosted       | the site you are on | Chrome and Firefox ask once to allow access to apps on this device. Safari blocks hosted pages from reaching `127.0.0.1`. Installable as an app. |
| Local server | `devpul`            | Any browser, Safari included. Serves these docs too.                                                                                             |

Both run entirely in the browser. The hosted site only serves the page; your app's data goes from the app to the tab.
