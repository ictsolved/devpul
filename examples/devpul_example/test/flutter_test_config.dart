import 'dart:async';

import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:devpul_test/devpul_test.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  DevpulTest.capture();
  reportTestException = DevpulFlutter.recordTestErrors(reportTestException);
  await testMain();
}
