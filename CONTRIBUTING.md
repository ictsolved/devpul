# Contributing

Issues and pull requests are welcome. For larger changes, open an issue first.

- `npm run check` passes: Dart format, analyze with no infos, tests (the core also on Chrome), then Prettier, oxlint, vitest, tsc and the UI build. `npm run check:dart` and `npm run check:web` run each half.
- Keep the core API small. New HTTP clients go in their own `devpul_<name>` package built on `DevpulHttp`.
- Changes to the event schema are breaking for adapters and plugins; bump `v` and document them in the README.
- Comments explain a non-obvious why, nothing else. Commit subjects are short and imperative.

## Development

```sh
npm install
npm run dev                # UI on http://localhost:5173
npm run dev -w apps/docs   # docs on http://localhost:4321/docs/
npm run check              # everything below
npm run check:dart         # dart format, analyze, tests (Chrome for the web tests)
npm run check:web          # prettier, oxlint, vitest, tsc, build
npm run format             # prettier --write
npm run screenshots        # docs, README and pub screenshots (needs img2webp)
```

The site URL and repository link live in `site.json`. Docs are a Starlight site in `apps/docs`. `npm run build:site` builds the whole site into `dist/`: the app at `/`, docs at `/docs/` and, with `DEVPUL_REGISTRY` set to the output of `npm run build:registry`, plugin pages at `/plugins/`.

## Releases

- `devpul` and `devpul_cli` release together, with the UI: `dart run tool/release.dart devpul 1.2.0`, tag `v1.2.0`.
- Every other package releases alone, when it changes: `dart run tool/release.dart devpul_dio 1.1.1`, tag `devpul_dio-v1.1.1`. It raises its `devpul` constraint only when it uses new core API.
- The script bumps versions and install snippets, checks the changelogs and the semver bump, and prints the publish, tag and push commands.
- Plugins release on their own with a `<id>-vX.Y.Z` tag; the plugins page lists them from their tags.
- The site deploys from the `stable` branch: the last core release, merged in by the release commands, plus docs and site fixes cherry-picked from main. Package and plugin tags and registry changes on main redeploy it with a fresh plugin list.
