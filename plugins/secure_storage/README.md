# secure_storage

A Secure storage tab for DevPul: the keys in the app's `flutter_secure_storage`. Values stay in the app until you reveal one, which reads that key alone. With Allow writes on in the Plugins tab, edit, add and delete keys.

```sh
devpul add secure_storage
```

```dart
import 'devpul/plugins.dart';

void main() {
  DevpulPlugins.install();
  DevpulSecureStorage.install();
  runApp(const App());
}
```

Pass the app's own instance, `install(storage: storage)`, when it sets Android, Apple, web or Windows options; without one the tab reads `const FlutterSecureStorage()`. It does nothing unless `Devpul.included`.
