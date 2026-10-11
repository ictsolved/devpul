import 'package:devpul/devpul.dart';

/// Sends my_plugin.set events to DevPul.
abstract final class DevpulMyPlugin {
  /// Sends [value] as the latest value of [name]. Does nothing unless
  /// [Devpul.included].
  static void set(String name, Object? value) {
    if (!Devpul.included) return;
    Devpul.emit('my_plugin.set', {'name': name, 'value': value});
  }
}
