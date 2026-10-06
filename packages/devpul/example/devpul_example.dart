import 'package:devpul/devpul.dart';

// dart run --enable-vm-service example/devpul_example.dart
// Then paste the printed VM service URL into https://devpul.saradgajurel.com.np
Future<void> main() async {
  Devpul.session({'name': 'devpul example', 'version': '1.0.0'},
      tags: {'env': 'dev'});
  Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});

  // What an HTTP adapter does around each call.
  final call = DevpulHttp.request(
    method: 'GET',
    url: Uri.parse('https://example.com/items?page=1'),
    headers: {'accept': 'application/json'},
  );
  await Future<void>.delayed(const Duration(milliseconds: 120));
  call?.response(status: 200, body: '{"items": []}');

  try {
    throw StateError('cart is empty');
  } catch (e, s) {
    Devpul.error(e, s, source: 'example');
  }

  // Keeps the VM service up so the UI can connect.
  await Future<void>.delayed(const Duration(minutes: 10));
}
