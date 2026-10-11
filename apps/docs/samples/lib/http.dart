import 'package:devpul_http/devpul_http.dart';

final client = DevpulClient();

Future<String> items() => client.read(Uri.parse('https://example.com/items'));
