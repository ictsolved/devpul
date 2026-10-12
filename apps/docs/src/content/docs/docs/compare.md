---
title: DevPul, DevTools and talker
description: How DevPul compares with Flutter DevTools and the talker logger, what each does best, and when DevPul is the wrong tool.
---

The three overlap on network calls and logs and differ in where they run and what they reach. They work side by side: DevPul is also a tab in DevTools, and an app can log to talker and DevPul at once.

## Flutter DevTools

The debugging and profiling suite that ships with the SDK.

- Widget inspector, performance and frame timeline, CPU profiler, memory, app size and the debugger.
- The Network tab records `dart:io` `HttpClient` traffic with no code change, so it sees calls from packages you cannot wrap. It has no Flutter web support; the browser's own network panel covers that.
- Logging shows `print`, `debugPrint`, `dart:developer` `log` and framework events.

## talker

A logging and error handling package with a Flutter UI that runs inside the app.

- `TalkerScreen` lists logs, errors and HTTP calls on the device, with filters and sharing.
- Loggers for Dio, `package:http`, Bloc, Riverpod and more, and observers that forward errors to crash reporters.
- Runs in any build you ship it in, so testers can open the log screen and send it from a release build.

## DevPul

A browser UI for what a debug build sends, over the same VM service as DevTools.

- HTTP from any client through adapters, including on Flutter web, or from dart:io with no code change, next to errors, logs, routes and custom events, with one filter syntax across them.
- Several apps at once, history across reloads, HAR and session files.
- Plugin tabs for your own events and for parts of the app, such as state or files, and [actions](/docs/actions/) that run code in the app.
- Nothing in release builds and nothing inside the app's UI.

## When not to use DevPul

- **Release and QA builds**: DevPul does nothing there. Use talker, a crash reporter or your own logging.
- **Performance, memory, layout**: use DevTools.
- **Traffic outside adapters and dart:io**: on Flutter web DevPul sees only calls through an adapter, and on native only clients that use dart:io or record into `package:http_profile`. Use the browser's network panel, or a proxy.
- **Logs on a device away from your machine**: DevPul needs the VM service on `127.0.0.1`. talker shows them on the device.

See [Limits](/docs/limits/) for the rest.
