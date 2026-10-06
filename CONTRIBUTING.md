# Contributing

Issues and pull requests are welcome. For larger changes, open an issue first.

- Dart: `dart analyze --fatal-infos` passes with no infos, tests pass (`dart test`, `flutter test`). The core also runs `dart test -p chrome`.
- UI: `npm run check` passes (oxlint, vitest, tsc, build).
- Keep the core API small. New HTTP clients go in their own `devpul_<name>` package built on `DevpulHttp`.
- Changes to the event schema are breaking for adapters and plugins; bump `v` and document them in the README.
- Comments explain a non-obvious why, nothing else. Commit subjects are short and imperative.
