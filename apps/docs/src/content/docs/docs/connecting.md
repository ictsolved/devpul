---
title: Connecting
description: How DevPul connects to flutter run, dart run, flutter attach, Flutter web and IDE debug sessions, with devpul run, the printed link, DevTools or a pasted URL.
---

DevPul connects to the Dart Development Service (DDS) of a debug run over a websocket on `127.0.0.1`. It needs the VM service URL, which has a new port and token on every run. Each way below hands it that URL.

## devpul run

```sh
dart pub global activate devpul_cli
devpul run -d macos
```

`devpul run` runs `flutter run` with the arguments you give it, or `dart run` outside a Flutter project, and opens DevPul on `http://127.0.0.1:7171` connected to the app once it is up. A second `devpul run`, or `devpul <vm-service-url>`, hands its app to the tab that is already open. See [Command line](/docs/cli/).

## The printed link

The app prints a link to the DevPul tab of DevTools, which the app's Dart Development Service (DDS) serves:

```text
DevPul http://127.0.0.1:41234/AbCdEf12=/devtools/devpul_ext?uri=ws%3A%2F%2F127.0.0.1%3A41234%2FAbCdEf12%3D%2Fws
```

It works for any run, IDE runs included. The first time, DevTools asks to enable DevPul for the project; see [IDE setup](/docs/ide/#devtools-extension). **Open in window** in DevPul's header opens it in a window of its own, still connected. DDS has a new port every run, so settings, history and plugin approvals there start empty each run; [`devpul run`](#devpul-run) keeps them.

When it appears:

- **Flutter**: once a tool, such as `flutter run`, the IDE or `flutter attach`, is attached through DDS, which takes a moment after the app starts. Before that the app knows only the VM's own URL, which redirects to DDS, and browsers do not follow redirects for websockets. It prints again after each hot restart.
- **Plain Dart**: at the first DevPul call, and again if the URL changes. The link is `http://127.0.0.1:41234/AbCdEf12=/?page=devpul_ext`, which opens the DevPul tab from Dart 3.14 and DevTools' home before it.

The link appears only after the app's first DevPul call, such as `Devpul.session`. Under `devpul run` it opens devpul's own page. Set [`uiUrl`](/docs/api/#configuration) to link to another copy of DevPul with `#connect=`; `printLink: false` or `console: ConsoleMode.off` turn it off. Flutter web prints no link.

## DevTools

DevPul is a DevTools extension in the `devpul` package, connected to the app DevTools is connected to. See [IDE setup](/docs/ide/).

## Paste the URL

Any of these work:

- the `http://127.0.0.1:PORT/TOKEN=/` line from `flutter run` or `dart run --enable-vm-service`
- a DevTools link that contains `?uri=...`
- a `ws://127.0.0.1:PORT/TOKEN=/ws` URL

Paste it into the field, or anywhere on the page outside a text field. On the hosted site this needs Dart 3.13 or older; see [Hosted or local](#hosted-or-local).

<img class="dark:sl-hidden" src="/screenshots/home-light.webp" alt="The DevPul home page with the VM service URL field and Connect button" width="1440" height="900" loading="lazy" />
<img class="light:sl-hidden" src="/screenshots/home-dark.webp" alt="The DevPul home page with the VM service URL field and Connect button" width="1440" height="900" loading="lazy" />

| Tool                           | Where                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------- |
| `flutter run`                  | "A Dart VM Service on ... is available at:"                                                       |
| `dart run --enable-vm-service` | "The Dart VM service is listening on"                                                             |
| VS Code                        | Debug Console, the "Connecting to VM Service at" line, or the command "Dart: Copy VM Service URL" |
| Android Studio, IntelliJ       | Run tool window, the VM service line                                                              |

## Restarts and stale URLs

Hot reload and hot restart keep the URL. A full restart gets a new port and token: paste the new URL, or click the new link, and DevPul replaces the old one. A saved URL that is not connected belongs to a run that ended. URLs that are still connected stay, so you can watch several apps at once.

A hot restart or a replaced URL also drops that app's older events. With **Keep earlier runs** in Settings, earlier runs stay and show as separate run chips.

## Open DevPul already connected

Add the URL after `#connect=` on devpul's page, or on the hosted site for Dart 3.13 and older:

```text
http://127.0.0.1:7171/#connect=http://127.0.0.1:41234/AbCdEf12=/
```

Any site can link here, so a link connects only to this machine: `localhost`, `127.0.0.0/8` or `[::1]`. DevPul ignores a link to any other host and says so. A pasted URL may point anywhere.

## Paused in the debugger

While the app is stopped at a breakpoint, its connection shows **paused** and DevPul sends it nothing: actions, plugin calls and limit changes are disabled, since the app would run them only on resume. DevPul fetches what it missed once the app resumes. A call the running app does not answer within 5 s fails with an error.

## Runs and platforms

| Run                                    | Notes                                                                                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flutter run` on Android, iOS, desktop | Full support. Devices are forwarded to `127.0.0.1` by flutter tools.                                                                                                                                                                                  |
| `flutter attach`                       | Events from before the attach come from the app's own backlog.                                                                                                                                                                                        |
| Flutter web                            | No printed link; use `devpul run`, DevTools or the URL. Flutter web does not report uncaught async errors to `PlatformDispatcher.onError` ([flutter#100277](https://github.com/flutter/flutter/issues/100277)); see [Flutter](/docs/flutter/#errors). |
| Plain Dart                             | `dart run --enable-vm-service`, or `devpul run`. Avoid `--observe`: it pauses isolates on exit, which stalls `Isolate.run` and Dio's background JSON decoding.                                                                                        |

## Hosted or local

| Where        | How                      | Notes                                                                                                                                                                                                                                                           |
| ------------ | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local server | `devpul`                 | Any browser, Safari included.                                                                                                                                                                                                                                   |
| DevTools     | the printed link, an IDE | Served by DDS or the IDE.                                                                                                                                                                                                                                       |
| Hosted       | the site you are on      | Dart 3.13 and older: from Dart 3.14 the VM service refuses websockets from pages not on `127.0.0.1`, and the browser shows no reason. Chrome and Firefox ask once to allow access to apps on this device. Safari blocks hosted pages from reaching `127.0.0.1`. |

All of them run entirely in the browser. The hosted site only serves the page; your app's data goes from the app to the tab. Each keeps its own settings and history; see [Limits](/docs/limits/#one-store-per-origin).
