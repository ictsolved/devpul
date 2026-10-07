---
title: Event contract
description: The devpul.* events a Dart app posts on the VM service Extension stream, their envelope and fields, and the ext.devpul service extensions.
---

# Event contract

Everything DevPul shows arrives as `dart:developer` `postEvent` calls on the VM service **Extension** stream. Any tool that reads that stream can use the same events, and any code that posts them shows up in DevPul.

## Envelope

Kinds are posted as `devpul.<kind>`. Every event carries:

| Field | |
| --- | --- |
| `v` | Schema version, `1`. |
| `session` | Random per isolate; stable across hot reload, new on hot restart. |
| `seq` | Increments per isolate. With `session`, it identifies the event, so replays de-duplicate. |
| `ts` | Milliseconds since the epoch. |
| `tags` | `Devpul.tags` when set, string to string. |

The VM adds the isolate and isolate group. The UI groups events into runs by isolate group (by `session` on the web).

Fields longer than `maxValueLength` are replaced by a marker:

```json
{"devpul.truncated": {"size": 2400000, "preview": "{\"items\": [..."}}
```

## Kinds

| Kind | Fields |
| --- | --- |
| `http.request` | `id`, `method`, `url`, `params`, `headers`, `body`, `curl` |
| `http.response` | `id`, `method`, `url`, `status`, `statusMessage`, `finalUrl`, `durationMs`, `headers`, `body` |
| `http.error` | `id`, `method`, `url`, `status`, `errorType`, `message`, `durationMs`, `headers`, `body` |
| `app.session` | free-form |
| `app.actions` | `actions`: names, in registration order |
| `error` | `source`, `type`, `message`, `library`, `context`, `information`, `silent`, `stack` |
| `log` | `level`, `message`, `name`, `error`, `stack` |
| `route` | `action` (`push`, `pop`, `replace`, `remove`), `route`, `previous`, `arguments` |
| anything else | custom, shown in Events or a plugin tab |

HTTP events pair on `session` + `id`. A response may arrive before its request; the UI pairs them either way. `finalUrl` is present only when a redirect ended somewhere else.

## Service extensions

Each isolate that emits registers:

| Method | Params | Returns |
| --- | --- | --- |
| `ext.devpul.backlog` | none | `{"events": [{"kind": "devpul.http.request", "data": {...}}, ...]}`: recent events up to `backlogSize`, plus the latest session and actions. |
| `ext.devpul.action` | `name` | `{"result": ...}` from the action, or an extension error with the exception text. Registered with the first `Devpul.action`. |

The UI calls `ext.devpul.backlog` on connect and whenever an isolate registers it, because DDS keeps only the last 10,000 Extension events, shared with Flutter's per-frame events.

## Versioning

New fields and kinds can appear without a version change; readers ignore what they do not know. `v` changes only when an existing field changes meaning.
