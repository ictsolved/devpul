import 'package:devpul_flutter/devpul_flutter.dart';
// ignore: deprecated_member_use
import 'package:flutter/material.dart';

import 'stubs.dart';

void main() {
  DevpulFlutter.install();
  DevpulFlutter.captureDebugPrint(); // optional: debugPrint to the Logs tab
  runApp(
    MaterialApp(
      navigatorObservers: [DevpulNavigatorObserver()], // optional: route events
      builder: DevpulApp.builder, // optional: Overrides tab
      home: const Home(),
    ),
  );
}
