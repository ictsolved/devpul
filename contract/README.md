# Contract fixtures

What the Dart packages send and the UI reads, with session ids, times, durations and the package version normalized. Dart golden tests write them; the UI's `contract.test.ts` parses them.

| File           |                                                                 |
| -------------- | --------------------------------------------------------------- |
| `events.json`  | Every kind `devpul` posts, as `ext.devpul.backlog` serves them. |
| `flutter.json` | Route and Flutter error events from `devpul_flutter`.           |
| `info.json`    | The `ext.devpul.info` handshake.                                |
| `session.json` | A session file, format 1, holding both event files.             |

`app/` is an app as devpul leaves it after adding plugins, and `registry.json` a plugin registry; `devpul_cli` tests check both. `create/my_plugin/` is what `devpul create my_plugin` writes; the UI's `tsc` checks its module and `devpul.d.ts` against the plugin types the UI implements.

After a deliberate change, run `tool/update_goldens.sh` and review the diff.
