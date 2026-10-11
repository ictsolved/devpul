import 'package:devpul_http/devpul_http.dart';
import 'package:http/http.dart';
import 'package:http/retry.dart';

final client = DevpulClient(RetryClient(Client()));
