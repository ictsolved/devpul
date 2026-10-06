import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:dio/dio.dart';

// dart run --enable-vm-service example/devpul_dio_example.dart
// Then paste the printed VM service URL into https://devpul.saradgajurel.com.np
Future<void> main() async {
  Devpul.session({'name': 'devpul_dio example'});
  final dio = Dio(BaseOptions(baseUrl: 'https://httpbin.org'))
    ..interceptors.add(DevpulDioInterceptor());

  await dio.get<Object?>('/get', queryParameters: {'page': 1});
  await dio.post<Object?>('/post', data: {'sku': 'abc-1', 'qty': 2});
  await dio.post<Object?>(
    '/post',
    data: FormData.fromMap({
      'note': 'hello',
      'file': MultipartFile.fromBytes([1, 2, 3], filename: 'photo.png'),
    }),
  );
  try {
    await dio.get<Object?>('/status/404');
  } on DioException {
    // Shown in DevPul as http.error.
  }

  await Future<void>.delayed(const Duration(minutes: 10));
}
