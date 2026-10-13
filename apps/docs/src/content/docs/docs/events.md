---
title: Event contract
description: The devpul.* events a Dart app posts on the VM service Extension stream, their envelope and fields, and the ext.devpul service extensions.
---

Everything DevPul shows arrives as `dart:developer` `postEvent` calls on the VM service **Extension** stream. Any tool that reads that stream can use the same events, and any code that posts them shows up in DevPul.

## Envelope

Kinds are posted as `devpul.<kind>`. Every event is:

```json
{
  "v": 1,
  "session": "m1x2k9q3z",
  "seq": 12,
  "ts": 1767225600000,
  "tags": { "env": "dev" },
  "data": { "message": "hi" }
}
```

| Field     |                                                                                           |
| --------- | ----------------------------------------------------------------------------------------- |
| `v`       | Envelope version, `1`.                                                                    |
| `session` | Random per isolate; stable across hot reload, new on hot restart.                         |
| `seq`     | Increments per isolate. With `session`, it identifies the event, so replays de-duplicate. |
| `ts`      | Milliseconds since the epoch.                                                             |
| `tags`    | `Devpul.tags` when set, string to string.                                                 |
| `data`    | The fields of the kind, below.                                                            |

The VM adds the isolate and isolate group. The UI groups events into runs by isolate group (by `session` on the web).

Fields in `data` longer than `maxValueLength` are replaced by a marker:

```json
{ "devpul.truncated": { "size": 2400000, "preview": "{\"items\": [..." } }
```

## Kinds

| Kind            | `data`                                                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.request`  | `id`, `method`, `url`, `params`, `headers`, `body`, `curl`                                                                                    |
| `http.response` | `id`, `method`, `url`, `status`, `statusMessage`, `finalUrl`, `durationMs`, `headers`, `body`                                                 |
| `http.error`    | `id`, `method`, `url`, `status`, `errorType`, `message`, `durationMs`, `headers`, `body`                                                      |
| `app.session`   | free-form                                                                                                                                     |
| `app.info`      | the handshake, below; posted when actions, plugins or limits change                                                                           |
| `error`         | `source`, `type`, `message`, `library`, `context`, `information`, `widget`, `location` (`file`, `line`, `column`), `route`, `silent`, `stack` |
| `log`           | `level`, `message`, `name`, `error`, `stack`                                                                                                  |
| `route`         | `action` (`push`, `pop`, `replace`, `remove`), `route`, `previous`, `arguments`                                                               |
| anything else   | custom, shown in Events or a plugin tab                                                                                                       |

HTTP events pair on `session` + `id`. A response may arrive before its request; the UI pairs them either way. `finalUrl` is present only when a redirect ended somewhere else.

## Service extensions

Each isolate registers these with its first event, `ext.devpul.info` last:

| Method               | Params                   | Returns                                                                                                                                                                     |
| -------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ext.devpul.info`    | none                     | The handshake, below.                                                                                                                                                       |
| `ext.devpul.backlog` | none                     | `{"events": [{"kind": "devpul.log", "data": {...}}, ...]}`: recent events up to `backlogSize`, plus the latest session and info.                                            |
| `ext.devpul.action`  | `name`, `args`           | `{"result": ...}` from the action. `args` is a JSON object of param values; missing ones take their initial value.                                                          |
| `ext.devpul.call`    | `name`, `args`, `writes` | `{"result": ...}` from the [handler](/docs/api/#handlers). `args` is a JSON object; `writes` is `true` while Allow writes is on, and a `writes` handler refuses without it. |
| `ext.devpul.plugin`  | `id`                     | `{"source": "..."}`: the plugin's ES module.                                                                                                                                |
| `ext.devpul.limit`   | `kind`, `perSecond`      | The handshake after the change. `0` mutes; no `perSecond` removes the cap.                                                                                                  |

Failures, such as an unknown action or an invalid argument, are extension errors with the exception text.

The UI calls `ext.devpul.info` on connect and whenever an isolate registers it, then `ext.devpul.backlog`, because DDS keeps only the last 10,000 Extension events, shared with Flutter's per-frame events.

## Handshake

```json
{
  "protocol": 1,
  "version": "1.0.0",
  "capabilities": [],
  "actions": [{ "name": "Seed cart", "params": [{ "name": "items", "type": "number", "initial": 3 }] }],
  "plugins": [
    {
      "id": "routes",
      "origin": "devpul_flutter",
      "description": "The navigator stack after each route change.",
      "hash": "9aeb8d59b4d4..."
    }
  ],
  "limits": { "frame": 0 },
  "dropped": { "frame": 1520 }
}
```

| Field          |                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| `protocol`     | `1`. The UI compares it, not package versions.                                                                    |
| `version`      | The `devpul` package version.                                                                                     |
| `capabilities` | Features added after protocol 1, by name.                                                                         |
| `actions`      | In registration order. Param `type` is `text`, `number`, `flag` or `choice`; choices carry `options`.             |
| `plugins`      | Browser plugins from `Devpul.plugin`: id, optional version, origin and description, SHA-256 of the source in hex. |
| `limits`       | Events per second by kind; `0` is muted.                                                                          |
| `dropped`      | Events dropped by each limit so far.                                                                              |

## Session files

Export > Session file writes:

```json
{
  "type": "devpul.session",
  "format": 1,
  "exported": 1767225600000,
  "events": [
    {
      "kind": "log",
      "run": "...",
      "isolate": "main",
      "session": "...",
      "seq": 3,
      "ts": 1767225600000,
      "tags": {},
      "data": {}
    }
  ]
}
```

`kind` has no `devpul.` prefix. `run` groups events into one launch or hot restart; `tags` is present only when set.

The repository's [`contract/`](%REPO_URL%/tree/main/contract) folder holds sample events, a handshake and a session file that the Dart and UI tests both check.

## Versioning

New fields and kinds can appear without a version change; readers ignore what they do not know. `v`, `protocol` and the session file `format` change only when an existing field changes meaning. Events without `data` come from a devpul package older than 1.0; the UI asks to update it.
