## 1.1.0

- `devpul mcp <session file>` reads a session file, such as one `devpul_test` wrote for a failing test.
- `devpul mcp`: `list_requests` and `get_request` show calls paused at a breakpoint, the mock rule that changed a call, and what started it; `get_request` gives the id `http.replay` takes.
- `devpul create` writes `devpul.d.ts` with `context.requests`, `onRequests` and `openRequest`.

## 1.0.0

- `add`, `sync` and `upgrade` warn about `plugin.json` fields they do not know and install the plugin; `check` and the registry reject them.

## 1.0.0-dev.1

- First release: `devpul [vm-url]`, `devpul run`, `--plugin`.
- `devpul run --profile` keeps DevPul in the profile build.
- Plugin commands: `add`, `remove`, `list`, `sync`, `sync --check`, `outdated`, `upgrade`, `cache clean`.
- `devpul add dio` and `devpul add http` run `pub add` for the adapter packages.
- `update`: `dart pub global activate devpul_cli`.
- `devpul mcp`: MCP server on stdio with the app's requests, logs, errors, events, actions and plugin handlers.
