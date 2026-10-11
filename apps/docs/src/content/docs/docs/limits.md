---
title: Limits
description: What DevPul does not do - debug builds only, configuration and sessions per isolate, one store of settings and history per browser origin, event size and rate costs.
---

## Debug builds

DevPul runs in debug builds, and in native profile builds built with `DEVPUL_PROFILE`. Release builds have no VM service, and every DevPul call is a no-op there, so it cannot help with a bug that shows only in release, or on a tester's device with no debugger attached.

## One isolate at a time

Configuration, the session, tags, actions, handlers, plugins and limits are per isolate. An event from a background isolate carries none of the main isolate's tags and follows its own `DevpulConfig`. Call `Devpul.configure` and `Devpul.session` again in a long-lived isolate when you need them there. Each isolate also keeps its own backlog.

## One store per origin

Browsers keep storage per origin, so each place DevPul runs from has its own settings, history, saved URLs and plugin approvals:

| Origin                         | Store                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The hosted site                | One, across every run and IDE.                                                                                                                         |
| `devpul` on `127.0.0.1:<port>` | One per port. The port stays 7171 unless you pass `--port` or it is taken.                                                                             |
| DevTools                       | One per DevTools server. The IDE keeps one per session; DevTools served by DDS from a `flutter run` link gets a new port, and starts empty, every run. |

Nothing moves between them. Approve a plugin once in each.

## Events cost the app time and memory

Events are encoded as JSON on the app's isolate, about 0.1 ms for a 2 KB event in a Linux profile build. Very large or very frequent events cost frame time and memory.

- Each event field is cut at [`maxValueLength`](/docs/api/#configuration), 1,048,576 characters of JSON by default.
- The app keeps a backlog of up to [`backlogSize`](/docs/api/#configuration), 16,777,216 characters of JSON by default, per isolate, so DevPul can catch up when it connects late. Older events are gone.
- DDS keeps only the last 10,000 events of the Extension stream, shared with Flutter's own per-frame events.
- Busy kinds can be muted or capped with [limits](/docs/api/#limits), in the app or from Settings.

## What it does not see

- HTTP calls show only through an [adapter](/docs/adapters/): `devpul_dio`, `devpul_http` or your own. A package that makes its own `HttpClient` calls stays invisible.
- `print` output, platform logs and native crashes are not captured. `debugPrint` is, with `DevpulFlutter.captureDebugPrint()`.
- Flutter web does not report uncaught async errors; see [Flutter](/docs/flutter/#errors).

## Other limits

- No request replay, mocking or breakpoints on requests.
- Calls from the UI into the app, such as actions and plugin requests, are disabled while the app is paused in the debugger and fail after 5 s without an answer.
- Plugin sources are limited to 512 KB.
- Safari does not let the hosted site reach `127.0.0.1`; use `devpul`.
- Flutter web prints no connect link.
