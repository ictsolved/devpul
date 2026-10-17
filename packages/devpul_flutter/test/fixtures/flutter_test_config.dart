import 'dart:async';
import 'dart:io';

import 'package:devpul/devpul.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:devpul_test/devpul_test.dart';
import 'package:flutter_test/flutter_test.dart';

Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
  DevpulTest.capture(directory: Platform.environment['DEVPUL_OUT']!);
  reportTestException = DevpulFlutter.recordTestErrors(reportTestException);
  await testMain();
}
