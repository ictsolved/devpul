import 'package:devpul/devpul.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Serves the app's flutter_secure_storage to the Secure storage tab.
abstract final class DevpulSecureStorage {
  /// Lets the Secure storage tab list keys, read one value at a time and,
  /// with Allow writes on, write and delete them. Pass the app's own
  /// [storage] so its platform options apply. Does nothing unless
  /// [Devpul.included].
  static void install({
    FlutterSecureStorage storage = const FlutterSecureStorage(),
  }) {
    if (!Devpul.included) return;
    // Values stay in the app until the user reveals one.
    Devpul.handle(
      'secure_storage.keys',
      (_) async => {'keys': (await storage.readAll()).keys.toList()..sort()},
    );
    Devpul.handle(
      'secure_storage.read',
      (args) async => {'value': await storage.read(key: _string(args, 'key'))},
    );
    Devpul.handle(
      'secure_storage.write',
      (args) => storage.write(
        key: _string(args, 'key'),
        value: _string(args, 'value', empty: true),
      ),
      writes: true,
    );
    Devpul.handle(
      'secure_storage.delete',
      (args) => storage.delete(key: _string(args, 'key')),
      writes: true,
    );
  }
}

String _string(Map<String, Object?> args, String name, {bool empty = false}) {
  final value = args[name];
  if (value is String && (empty || value.isNotEmpty)) return value;
  throw _SecureStorageError('No $name given.');
}

final class _SecureStorageError implements Exception {
  const _SecureStorageError(this.message);

  final String message;

  @override
  String toString() => message;
}
