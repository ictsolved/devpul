# devpul_test

Test capture for [DevPul](https://devpul.saradgajurel.com.np). Records what the code under test sends to DevPul during `dart test` and `flutter test`, integration tests included, and writes a session file for each test that fails: its requests, logs, routes, state and custom events, with the failure as an error and the steps before it. Open the file in the DevPul UI, keep it as a CI artifact, or read it with `devpul mcp`.

## Install

```yaml
dev_dependencies:
  devpul_test: ^1.1.0
```

## Usage

```dart
void main() {
  DevpulTest.capture();

  test('places an order', () async {
    await placeOrder();
    expect(cart.items, isEmpty);
  });
}
```

In Flutter, `flutter_test_config.dart` covers every test in its folder. `recordTestErrors` sends the exception `testWidgets` caught, with the widget behind it:

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

A failing test writes `build/devpul/<test file without .dart>/<test name>.json` and prints the path. See the [Tests page](https://devpul.saradgajurel.com.np/docs/testing/).

## Limits

- Records only what reaches DevPul from the test's own isolate.
- No files on the web.
- Integration tests on a phone or emulator cannot write into the project.
