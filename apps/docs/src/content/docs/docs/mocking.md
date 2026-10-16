---
title: Mocks and breakpoints
description: Answer, fail, delay or pause HTTP calls in the running app from the DevPul UI or an agent, and edit requests and responses at a breakpoint.
---

Mock rules change HTTP calls made through [devpul_http](/docs/http/) or [devpul_dio](/docs/dio/), in the running app, with no code change. Set them from the HTTP tab or have an [agent](/docs/mcp/) set them.

## Rules

Open **Mocks** in the HTTP tab's toolbar, or select a request and click **Mock**: that makes a rule answering the same method and URL with the captured status, headers and body, ready to edit.

A rule matches a method, or any, and a whole URL where `*` stands for any run of characters: `https://api.example.com/users/*`, `*/health`, `*`. Rules are checked in order and the first match applies. New rules go first; the arrow moves a rule to the top. Each rule has a switch to turn it off without deleting it.

| Mode    | What the app gets                                                                             |
| ------- | --------------------------------------------------------------------------------------------- |
| Respond | The rule's status, headers and body. Nothing is sent.                                         |
| Fail    | A network error with the rule's message: `ClientException` or `DioException.connectionError`. |
| Delay   | The real response, after the delay.                                                           |
| Pause   | The request, the response or both held until you let them go from the UI. See below.          |

Respond and Fail take a delay too. **Simulate offline** adds `*` with Fail, so every call fails while it is on.

A mocked call still runs every Dio interceptor, and a status that fails `validateStatus` throws `DioException.badResponse` as a real one does. In the list, a flask marks calls a rule changed; the detail panel says which mode, and the app's console line ends with `(mock: respond)`.

Rules live in the app's memory and end when it restarts, hot restart included. **Keep rules across restarts** in the Mocks dialog saves them in this browser per app name and sends them to the app's next run when that run has none. The status bar shows how many rules are on; click it to open them.

## Breakpoints

A Pause rule holds the call before it goes out, before the app gets the response, or both. The call shows as paused in the list and in the status bar. Select it to edit:

- before sending: method, URL, headers and body
- before the app gets the response: status, status message, headers and body

**Continue** sends what changed, **Continue unchanged** lets it go as it was, **Abort** fails it as a network error. Redacted headers shown as redacted keep their real value when sent back. Bodies are editable when they are text or JSON and fit `maxValueLength`; other bodies show read-only. A Dio map or list body goes back as JSON, so it must parse.

A held call goes on unchanged after 5 minutes, or as soon as no DevPul page or agent is connected, so a closed tab never stalls the app. Timeouts of the app's own, such as `.timeout()` on the future or Dio's `receiveTimeout`, still run while it is held.

## Agents

The app registers four [handlers](/docs/api/#handlers) that `devpul mcp` lists in `get_session`:

| Handler          | Tool                | Does                                                       |
| ---------------- | ------------------- | ---------------------------------------------------------- |
| `http.mocks`     | `call_plugin`       | Returns the rules.                                         |
| `http.mocks.set` | `call_plugin_write` | Replaces the rules with `{"rules": [...]}`.                |
| `http.paused`    | `call_plugin`       | Returns the held calls.                                    |
| `http.resume`    | `call_plugin_write` | Lets a held call go, with the fields to change or `abort`. |

`list_requests` shows `paused` and `[mock: mode]`; `get_request` on a paused call includes what is held and its id for `http.resume`. Rules an agent sets show in the UI.

## Limits

- Only calls through devpul_http, devpul_dio or an adapter that [opts in](/docs/adapters/#mock-rules). Requests read from dart:io's HTTP profile, `Image.network` among them, are not mocked.
- Calls matching `ignoreUrls` or `ignoreMethods` are not mocked.
- Rule bodies are text. A captured body that was binary or cut at `maxValueLength` does not come along; the editor says so.
- `text/event-stream` responses through devpul_http pass through and are not paused.
