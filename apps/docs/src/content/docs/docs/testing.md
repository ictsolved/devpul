---
title: Tests
description: devpul_test records DevPul events during dart test and flutter test, integration tests included, and writes a session file for each failing test to open in the UI or read with devpul mcp.
---

[devpul_test](https://pub.dev/packages/devpul_test) records what the code under test sends to DevPul, one test at a time. When a test fails, it writes that test's requests, logs, routes, state and custom events to a [session file](/docs/events/#session-files), with the failure as an error and the steps before it. Open the file in the UI, keep it as a CI artifact, or hand it to an agent.

```yaml
dev_dependencies:
  devpul_test: ^1.1.0
```

## Dart

```dart
void main() {
  DevpulTest.capture();

  test('places an order', () async {
    await placeOrder();
    expect(cart.items, isEmpty);
  });
}
```

`capture()` hooks every test declared after it in the file.

## Flutter

For every test in a folder, call it from `flutter_test_config.dart` in that folder, `test/` or `integration_test/`:

```dart
import 'dart:async';

import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:devpul_test/devpul_test.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  DevpulTest.capture();
  reportTestException = DevpulFlutter.recordTestErrors(reportTestException);
  await testMain();
}
```

`testWidgets` catches a failing test's exception and hands it to `reportTestException`, which prints it. `recordTestErrors` sends it to DevPul first, with the widget and where it was created, as [Errors](/docs/flutter/#errors) shows them in the app. Without it, the error in the file only says that the test failed.

## Files

A failing test writes `build/devpul/<test file without .dart>/<test name>.json` and prints the path with the failure:

```text
DevPul session file: build/devpul/test/cart_test/cart_adds_an_item.json
```

Passing and skipped tests write nothing. Each file holds one test as one run, named after it, with the app's latest session and handshake; events from `setUpAll` go to the first test after it. `capture(directory: 'build/test-sessions')` writes somewhere else. The paths are relative to the working directory, which `dart test` and `flutter test` set to the package.

Open a file with **Open a session file** on the [DevPul home page](%SITE_URL%) or in the UI's More menu, or drop it on the page.

## CI

Keep the files when the tests fail. On GitHub Actions:

```yaml
- run: flutter test
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: devpul-sessions
    path: build/devpul/
```

## Agents

Given a session file, [`devpul mcp`](/docs/mcp/#session-files) serves it with the tools it serves an app with: `list_errors` gives the failure, `get_event` its stack and the steps before it. Set it as the server command in the agent's config:

```sh
devpul mcp build/devpul/test/cart_test/cart_adds_an_item.json
```

## Limits

- Only what reaches DevPul is recorded: code under test that calls `Devpul`, and the adapters, observers and plugins it sets up. A widget test that builds its own `Dio` without the interceptor records no requests.
- Events from the test's own isolate only.
- No files on the web (`dart test -p chrome`, `flutter test --platform chrome`).
- Integration tests on a phone or emulator run on the device, which cannot write into the project; the test prints that the file could not be written. On Linux, macOS and Windows they write into the project.
