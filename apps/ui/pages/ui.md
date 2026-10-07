---
title: Using the UI
description: Filter syntax, sorting, keyboard shortcuts, grouping, export to HAR, session files and app actions in DevPul.
---

# Using the UI

## Tabs

| Tab | Shows |
| --- | --- |
| HTTP | Requests from the HTTP adapters, newest first, with live pending rows. |
| Errors | `Devpul.error`, Flutter errors and uncaught platform errors. |
| Logs | `Devpul.log` and captured `debugPrint`. Appears once there are logs. |
| Events | Everything else sent with `Devpul.emit`. |
| Plugin tabs | Events claimed by a [plugin](%ROOT%docs/plugins/). |

The header shows the latest `Devpul.session` fields; pick which ones in Settings.

## Filtering

Type in the filter box. Plain words must all match; `-word` excludes. In HTTP, words match the URL, id, status, bodies and error messages.

Fields narrow further. A comma means any of them, and a leading `-` negates.

| Field | Tab | Examples |
| --- | --- | --- |
| `status:` | HTTP | `status:4xx,5xx`, `status:>=400`, `status:404`, `status:err`, `status:pending` |
| `method:` | HTTP | `method:post`, `-method:options` |
| `host:` | HTTP | `host:api.example.com`, `-host:cdn` |
| `ms:` | HTTP | `ms:>500`, `ms:<=100` |
| `size:` | HTTP | `size:>100k`, `size:<1mb` |
| `tag:` | all | `tag:env=qa`, `tag:user` (any value) |
| `kind:` | lists | `kind:cart`, `-kind:route` |
| `source:`, `type:` | Errors | `source:flutter`, `type:StateError` |
| `level:`, `name:` | Logs | `level:warn,error`, `name:auth` |

Chips do the same for values seen in the data: status classes, methods, hosts, tags, app runs, sources, levels and kinds. Filters are remembered per tab.

## Sorting

Click a column header in HTTP to sort by it; click again to flip the direction. Rows without a value, such as pending requests when sorting by duration, go last either way. Sorting by time, newest first, shows a divider between app runs.

## Details

Select a row to see it on the right. Headers and params show as tables, bodies as a JSON tree; switch to raw JSON with the Raw button. Copy the URL, any section, a curl command or a `fetch()` call for the browser console.

In Errors, **Group repeats** folds identical errors into one row with a count, and each error lists the requests made in the 10 seconds before it. Click one to open it in HTTP.

**Pause** freezes which rows are listed; rows already shown still update. Resume shows how many arrived meanwhile.

## Keyboard

| Key | Does |
| --- | --- |
| `/` | Focus the filter |
| `j` `k` or arrows | Move the selection |
| `Esc` | Close the detail or leave the filter |
| `1` to `9` | Switch tabs |
| `?` | Shortcut list |

## Actions

Code the app registers with `Devpul.action` shows in the **Actions** menu. Clicking one runs it in the app and shows the result. See [Core API](%ROOT%docs/api/#actions).

## Export and import

**Export** offers:

- **HTTP as HAR**: every request as HAR 1.2, for browser devtools, Charles, Proxyman and bug reports.
- **Session file**: every event as JSON. Open it later with "Open a session file", or drop it on the page, to look at it without the app.

Exports contain whatever the app sent, tokens included. Use [redaction](%ROOT%docs/api/#redaction) before sharing.

## History

Events are kept in the browser (IndexedDB, 20,000 events and 200 MB by default, oldest dropped first), so a reload keeps them. Change the limit, turn it off or clear it in Settings. Nothing leaves the browser.
