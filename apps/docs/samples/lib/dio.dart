import 'package:devpul_dio/devpul_dio.dart';
import 'package:dio/dio.dart';

final dio = Dio()..interceptors.add(DevpulDioInterceptor());

void replays(HttpClientAdapter adapter) {
  final dio = Dio()..httpClientAdapter = adapter;
  dio.interceptors.add(DevpulDioInterceptor(dio: dio));
}
