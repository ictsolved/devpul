# Example

Run a Flutter app that uses [devpul](https://pub.dev/packages/devpul) with the UI connected:

```sh
dart pub global activate devpul_cli
devpul run -d macos
```

`devpul run` passes its arguments to `flutter run` and opens the UI on 127.0.0.1:7171, connected to the app.

Copy a plugin into the app, then check that the copy matches `devpul.lock`:

```sh
devpul add riverpod
devpul sync --check
```

Give a coding agent the app's requests, logs and errors over MCP while `devpul run` is open:

```sh
devpul mcp
```
