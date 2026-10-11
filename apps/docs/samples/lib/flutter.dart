import 'dart:async';

import 'package:devpul/devpul.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/material.dart';

import 'stubs.dart';

void main() {
  DevpulFlutter.install();
  runApp(const MyApp());
}

void web() {
  runZonedGuarded(
    () => runApp(const MyApp()),
    (e, s) => Devpul.error(e, s, source: 'zone'),
  );
}

void debugPrints() {
  DevpulFlutter.captureDebugPrint();
}

Widget routes() {
  final app = MaterialApp(navigatorObservers: [DevpulNavigatorObserver()]);
  return app;
}
