import 'package:devpul_http/devpul_http.dart';
import 'package:flutter/widgets.dart';
import 'package:http/http.dart' as http;

import 'stubs.dart';

void main() => http.runWithClient(() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const MyApp());
}, DevpulClient.new);
