---
title: Connecting
description: Connect DevPul to flutter run, dart run, flutter attach, Flutter web and IDE debug sessions, with a pasted URL, a link or a fixed port.
---

# Connecting

DevPul connects to the Dart Development Service (DDS) of a debug run. It needs the VM service URL, which changes on every run unless you fix it.

## Paste the URL

Any of these work:

- the `http://127.0.0.1:PORT/TOKEN=/` line from `flutter run` or `dart run --enable-vm-service`
- a DevTools link that contains `?uri=...`
- a `ws://127.0.0.1:PORT/TOKEN=/ws` URL

Paste it into the field, or anywhere on the page outside a text field.

Where to find it:

| Tool | Where |
| --- | --- |
| `flutter run` | "A Dart VM Service on ... is available at:" |
| `dart run --enable-vm-service` | "The Dart VM service is listening on" |
| VS Code | Debug Console, the "Connecting to VM Service at" line, or the command "Dart: Copy VM Service URL" |
| Android Studio, IntelliJ | Run tool window, the VM service line |

## Restarts and stale URLs

Hot reload and hot restart keep the URL. A full restart gets a new port and token. Paste the new URL and DevPul replaces the old one: a saved URL with a token that is not connected belongs to a run that ended. URLs that are still connected stay, so you can watch several apps at once.

With **Clear an app's earlier events when it restarts** in Settings, a hot restart or a replaced URL also drops that app's older events. Without it, earlier runs stay and show as separate run chips.

## Open DevPul already connected

Add the URL after `#connect=`:

```text
%SITE_URL%#connect=http://127.0.0.1:41234/AbCdEf12=/
```

The local server takes the URL as an argument and opens that link for you:

```sh
npx devpul http://127.0.0.1:41234/AbCdEf12=/
```

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

| Run | Notes |
| --- | --- |
| `flutter run` on Android, iOS, desktop | Full support. Devices are forwarded to `127.0.0.1` by flutter tools. |
| `flutter attach` | Always uses a token. Events from before the attach come from the app's own backlog. |
| Flutter web | Always uses a token. Flutter web does not report uncaught async errors to `PlatformDispatcher.onError` ([flutter#100277](https://github.com/flutter/flutter/issues/100277)); wrap `runApp` in `runZonedGuarded` and call `Devpul.error`. |
| Plain Dart | `dart run --enable-vm-service`. Avoid `--observe`: it pauses isolates on exit, which stalls `Isolate.run` and Dio's background JSON decoding. |

## Hosted, local or a file

| Where | How | Notes |
| --- | --- | --- |
| Hosted | the site you are on | Chrome and Firefox ask once to allow access to apps on this device. Safari blocks hosted pages from reaching `127.0.0.1`. Installable as an app. |
| Local server | `npx devpul` | Any browser, Safari included. Serves these docs too. |
| File | "Download as one HTML file" on the home page | One self-contained file that works from disk. |

All three run entirely in the browser. The hosted site only serves the page; your app's data goes from the app to the tab.
