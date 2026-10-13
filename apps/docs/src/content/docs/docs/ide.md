---
title: IDE setup
description: Use DevPul from VS Code, Android Studio and IntelliJ as a DevTools extension or through the link the app prints in the debug console.
---

Start the app from the IDE as usual; DevPul needs no launch configuration.

## DevTools extension

The `devpul` package ships DevPul as a DevTools extension, so it appears in DevTools for any app that depends on it, already connected to that app.

1. Start a debug session.
2. Open DevTools for it.
3. Enable DevPul when DevTools asks, once per project. DevTools writes the choice to `devtools_options.yaml` next to the app's `pubspec.yaml`; commit it so the rest of the team skips the question.

DevPul then sits in the DevTools tabs, or in the overflow menu when they do not fit.

| IDE                      | Where                                                                                                                        |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| VS Code                  | The Flutter sidebar lists DevPul under "DevTools Extensions"; click it to open it.                                           |
| Android Studio, IntelliJ | Open DevTools in the browser from the Run or Debug tool window, then pick the DevPul tab. The printed link below also works. |
| Browser                  | The DevTools link `flutter run` prints, then the DevPul tab.                                                                 |

Settings, history and plugin approvals are kept per DevTools server. The IDE keeps one server for its session, so they carry over between runs; DevTools opened from a `flutter run` link gets a new server, and starts empty, every run. See [Limits](/docs/limits/#one-store-per-origin).

## The printed link

At startup the app prints a link in the Debug Console or Run tool window:

```text
DevPul %SITE_URL%#connect=http%3A%2F%2F127.0.0.1%3A41234%2FAbCdEf12%3D%2F
```

Click it to open DevPul in the browser, connected to the app. Settings and history live on that site, so they stay across runs and IDEs. [Connecting](/docs/connecting/#the-printed-link) says when the link appears.

## devpul run in the IDE's terminal

`devpul run` in the integrated terminal runs the app with `flutter run` and opens DevPul at `http://127.0.0.1:7171`. The IDE's debugger is not attached to that run; use it when DevPul and the terminal keys are all you need. See [Command line](/docs/cli/#devpul-run).

## Open in the editor

In error and log detail, stack frames with a `package:` or `file:` URI and the widget location of a Flutter error are links. A click opens the file at the line where the IDE can take it, and copies `path:line:column` where it cannot:

| How the app and DevPul run                                          | A click                                               |
| ------------------------------------------------------------------- | ----------------------------------------------------- |
| DevPul as a DevTools extension in VS Code                           | Opens the file in VS Code.                            |
| App started from the VS Code debugger, DevPul in the browser        | Opens the file in VS Code, through the debug session. |
| App started from the Android Studio or IntelliJ debugger            | Sends the location to the debug session.              |
| `devpul run` or `flutter run` in a terminal, or an imported session | Copies the location.                                  |

The status bar says which one happened. `dart:` frames have no file to open and stay plain text.
