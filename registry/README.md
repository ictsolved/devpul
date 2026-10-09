# Registry

`third-party.json` lists plugins kept outside this repository. Add one by pull request:

```json
[
  { "id": "cart", "url": "https://github.com/example/devpul-plugins.git", "path": "cart" },
  { "id": "flags", "url": "https://example.com/flags/plugin.json" }
]
```

- `url`: an https git repository with `<id>-v<version>` tags, or an https `plugin.json` URL.
- `path`: the plugin folder in the repository, when it is not the root.

CI fetches each plugin's latest version as `devpul add <id>` would, validates it as `devpul check` does, and builds `registry.json` and the pages under `/plugins/`. Run `devpul check` on the folder before opening the pull request. Plugins in `plugins/` are listed from their tags.

`npm run build:registry` builds it locally into `build/registry`.
