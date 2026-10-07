# Contract fixtures

What the Dart packages send and the UI reads, with session ids, times, durations and the package version normalized. Dart golden tests write them; the UI's `contract.test.ts` parses them.

| File           |                                                                 |
| -------------- | --------------------------------------------------------------- |
| `events.json`  | Every kind `devpul` posts, as `ext.devpul.backlog` serves them. |
| `flutter.json` | Route and Flutter error events from `devpul_flutter`.           |
| `info.json`    | The `ext.devpul.info` handshake.                                |
| `session.json` | A session file, format 1, holding both event files.             |

After a deliberate change, run `tool/update_goldens.sh` and review the diff.
