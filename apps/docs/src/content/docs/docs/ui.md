---
title: Using the UI
description: Filter syntax, sorting, keyboard shortcuts, grouping, export to HAR, session files and app actions in DevPul.
---

## Tabs

| Tab         | Shows                                                                                                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| HTTP        | Requests from the HTTP adapters, and from [dart:io](#http-without-an-adapter) when turned on, newest first, with live pending rows. |
| Errors      | `Devpul.error`, Flutter errors and uncaught platform errors.                                                                        |
| Logs        | `Devpul.log`, captured `debugPrint` and `developer.log`. Appears once there are logs.                                               |
| Events      | Everything else sent with `Devpul.emit`.                                                                                            |
| Plugin tabs | Events claimed by a [plugin](/docs/plugins/).                                                                                       |
| Plugins     | Offers, approvals, updates, load errors and Allow writes. At the right end.                                                         |

<img class="dark:sl-hidden" src="/screenshots/http-light.webp" alt="The HTTP tab with a POST request open: URL, headers and JSON bodies" width="1440" height="900" loading="lazy" />
<img class="light:sl-hidden" src="/screenshots/http-dark.webp" alt="The HTTP tab with a POST request open: URL, headers and JSON bodies" width="1440" height="900" loading="lazy" />

## Status bar

The bar at the bottom shows the connection state, the latest `Devpul.session` fields, the result of the last action or hot reload, Writes on while Allow writes is on, [mock rules](/docs/mocking/) turned on and calls held at a breakpoint, muted and rate-limited kinds, plugin load errors, and stored events against the limit. Pick the session fields in Settings; those that do not fit sit behind "+N", and hovering shows them all. Click Writes on to turn writes off, the mocks to open them, the paused calls to edit the first, the limits to open Settings, or the errors to open the Plugins tab.

## Filtering

Type in the filter box. Plain words must all match; `-word` excludes. In HTTP, words match the URL, id, status, bodies and error messages.

Fields narrow further. A comma means any of them, and a leading `-` negates.

| Field                        | Tab    | Examples                                                                          |
| ---------------------------- | ------ | --------------------------------------------------------------------------------- |
| `status:`                    | HTTP   | `status:4xx,5xx`, `status:>=400`, `status:404`, `status:err`, `status:pending`    |
| `method:`                    | HTTP   | `method:post`, `-method:options`                                                  |
| `host:`                      | HTTP   | `host:api.example.com`, `-host:cdn`                                               |
| `ms:`                        | HTTP   | `ms:>500`, `ms:<=100`                                                             |
| `size:`                      | HTTP   | `size:>100k`, `size:<1mb`                                                         |
| `tag:`                       | all    | `tag:env=qa`, `tag:user` (any value)                                              |
| `cause:`                     | HTTP   | `cause:replay,action,event`, `cause:bloc` (event kind or action name), `cause:#6` |
| `kind:`                      | lists  | `kind:cart`, `-kind:route`                                                        |
| `source:`, `type:`, `route:` | Errors | `source:flutter`, `type:StateError`, `route:cart`                                 |
| `level:`, `name:`, `source:` | Logs   | `level:warn,error`, `name:auth`, `source:developer.log`                           |

Chips do the same for values seen in the data: status classes, methods, hosts, tags, app runs, sources, levels and kinds. Filters are remembered per tab.

## Sorting

Click a column header in HTTP to sort by it; click again to flip the direction. Rows without a value, such as pending requests when sorting by duration, go last either way. Sorting by time, newest first, shows a divider between app runs.

## Details

Select a row to see it on the right. Headers and params show as tables, bodies as raw JSON; switch between **Tree** and **Raw** in the header. The choice holds for every detail that shows JSON: HTTP bodies, Events, and plugin events the plugin does not render. Copy the URL, any section, a curl command or a `fetch()` call for the browser console. A JWT in a bearer `Authorization` header shows decoded under **Bearer token**: claims, with `exp`, `iat` and `nbf` as times and how long before or after the request it expires, and the header. The signature is not checked. **Started by** shows what made the request when the app knows: the call it [replays](/docs/mocking/#replay), an action run from the Actions menu, or an event such as `bloc.event` from the bloc plugin or a [`DevpulCause`](/docs/api/#causes); click it to open that call or event, and **Back** returns. The `#` column marks such rows: a loop for a replay, a pointer for an action, an arrow for an event. The other way, an event's detail lists the calls it started under **Requests started**. Image bodies show as a preview with their type, dimensions and size, and so do SVG bodies sent as text. In Tree view, `data:` image strings anywhere in the JSON show as thumbnails; click one to enlarge it.

In Tree view and in tables, plugin views included, values carry hints: a **JWT** or **JSON** chip on a string that holds one, which expands it in place, and the local time beside an epoch number under `exp`, `iat`, `nbf`, `auth_time` or a key ending in `_at` or `At`, beside the `Date`, `Expires`, `Last-Modified` and `If-Modified-Since` headers, and beside `Retry-After` and rate limit resets. Right-click a value, or use the `...` button that shows on hover, to decode it as Base64, URL, JWT, JSON or a timestamp, or to copy the value or its path. Seconds and milliseconds are told apart by size.

<img class="dark:sl-hidden" src="/screenshots/errors-light.webp" alt="The Errors tab with a FormatException open: message, context, stack trace and what happened before it" width="1440" height="900" loading="lazy" />
<img class="light:sl-hidden" src="/screenshots/errors-dark.webp" alt="The Errors tab with a FormatException open: message, context, stack trace and what happened before it" width="1440" height="900" loading="lazy" />

In Errors, **Group repeats** folds identical errors into one row with a count. The header shows the route at the time of the error. **Before this error** lists the last 30 routes, logs, events and requests of the same app run, newest first, with how long before the error each happened. Click one to open it in its tab; **Back** returns. The list is built from the events DevPul holds, so it works on an imported session file and leaves out events dropped by the memory limit.

## HTTP without an adapter

Calls through dart:io's `HttpClient` can show with no adapter: `package:http`'s `IOClient`, Dio's default adapter, `Image.network` and packages that make their own calls. Click the globe on a connection to turn it on. DevPul turns on dart:io's HTTP logging in each isolate, reads its HTTP profile every second, and turns logging back off when you click again, remove the connection or close the page. The choice is kept per VM service host and port.

- These rows show `dart:io` in the `#` column and in the detail; type `dart:io` in the filter to list them.
- A request an adapter reported shows once, from the adapter. A followed redirect is one row with the URL it ended at.
- A request shows once its response headers arrive or it fails. Images up to about 768 KB show as previews; other bodies that are not text show their size.
- The app's ignore and redact rules do not apply.
- Clients that record into `package:http_profile` show the same way.
- Flutter web has no dart:io and shows no globe.

**Pause** keeps the listed rows as they are; rows already shown still update. Resume shows how many arrived meanwhile.

## Keyboard

| Key               | Does                                 |
| ----------------- | ------------------------------------ |
| `/`               | Focus the filter                     |
| `j` `k` or arrows | Move the selection                   |
| `Esc`             | Close the detail or leave the filter |
| `1` to `9`        | Switch tabs                          |
| `r` `R`           | Hot reload, hot restart              |
| `?`               | Shortcut list                        |

## Actions

Code the app registers with `Devpul.action` shows in the **Actions** menu. Clicking one runs it in the app and shows the result. Actions are disabled while the app is paused in the debugger. See [Actions](/docs/actions/).

## Hot reload

Apps started with `flutter run` or `devpul run` get **Reload** and **Restart** buttons, the same as `r` and `R` in the terminal. With several apps connected, both act on each one.

## Limits

Settings lists the event kinds of each connected app. Mute a kind or cap it per second there, and see how many events the app dropped. The app applies them before it sends anything, until it restarts. See [Core API](/docs/api/#limits).

## Export and import

**Export** offers:

- **HTTP as HAR**: every request as HAR 1.2, for browser devtools, Charles, Proxyman and bug reports.
- **Session file**: every event as JSON. Open it later with "Open a session file", or drop it on the page, to look at it without the app.

Exports contain whatever the app sent, tokens included. Use [redaction](/docs/api/#redaction) before sharing.

## History

DevPul keeps up to 50 MB of events by default, oldest dropped first, and stores them in the browser (IndexedDB), so a reload keeps them. Change the limit, turn storage off or clear it in Settings, which also shows how many events the limit dropped. Nothing leaves the browser.

**Clear** empties every tab. Events the app sent before it do not come back when DevPul reconnects or reloads.
