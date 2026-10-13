## 1.0.0-dev.1

- First release: `devpul [vm-url]`, `devpul run`, `--plugin`.
- `devpul run --profile` keeps DevPul in the profile build.
- Plugin commands: `add`, `remove`, `list`, `sync`, `sync --check`, `outdated`, `upgrade`, `cache clean`.
- `devpul add dio` and `devpul add http` run `pub add` for the adapter packages.
- `update`: `dart pub global activate devpul_cli`.
- `devpul mcp`: MCP server on stdio with the app's requests, logs, errors, events, actions and plugin handlers.
