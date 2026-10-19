import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:dio/dio.dart';
// ignore: deprecated_member_use
import 'package:flutter/material.dart';

import 'stubs.dart';

final dio = Dio();

void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0', 'flavor': 'dev'});
  dio.interceptors.add(DevpulDioInterceptor());
  runApp(
    MaterialApp(
      navigatorObservers: [DevpulNavigatorObserver()],
      home: const Home(),
    ),
  );
}
