import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';

import 'stubs.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());

void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0', 'env': 'dev'});
  runApp(
    MaterialApp(
      navigatorObservers: [DevpulNavigatorObserver()],
      home: const HomePage(),
    ),
  );
}
