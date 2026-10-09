import 'package:devpul/devpul.dart';

const _debug =
    !bool.fromEnvironment('dart.vm.product') &&
    !bool.fromEnvironment('dart.vm.profile');

/// Sends my_plugin.set events to DevPul.
abstract final class DevpulMyPlugin {
  /// Sends [value] as the latest value of [name]. Does nothing in release and
  /// profile builds.
  static void set(String name, Object? value) {
    if (!_debug) return;
    Devpul.emit('my_plugin.set', {'name': name, 'value': value});
  }
}
