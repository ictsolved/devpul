import 'dart:async';

import '../my_plugin.dart';

// Sets a value each second: devpul --plugin . run example/main.dart
void main() {
  var count = 0;
  Timer.periodic(const Duration(seconds: 1), (_) {
    DevpulMyPlugin.set('count', ++count);
  });
}
