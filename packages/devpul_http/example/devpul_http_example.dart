import 'package:devpul/devpul.dart';
import 'package:devpul_http/devpul_http.dart';

// dart run --enable-vm-service example/devpul_http_example.dart
// Then paste the printed VM service URL into https://devpul.saradgajurel.com.np
Future<void> main() async {
  Devpul.session({'name': 'devpul_http example'});
  final client = DevpulClient();

  await client.get(Uri.parse('https://httpbin.org/get?page=1'));
  await client.post(
    Uri.parse('https://httpbin.org/post'),
    headers: {'content-type': 'application/json'},
    body: '{"sku": "abc-1", "qty": 2}',
  );
  await client.get(Uri.parse('https://httpbin.org/status/404'));

  await Future<void>.delayed(const Duration(minutes: 10));
}
