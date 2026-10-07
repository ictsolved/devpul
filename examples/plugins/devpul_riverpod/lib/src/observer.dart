import 'dart:convert';
import 'dart:developer' as developer;

import 'package:devpul/devpul.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'plugin.dart';

/// Sends provider changes to DevPul and offers the UI a Riverpod tab.
///
/// ```dart
/// runApp(ProviderScope(observers: [DevpulProviderObserver()], child: app));
/// ```
final class DevpulProviderObserver extends ProviderObserver {
  DevpulProviderObserver() {
    if (_ready || !Devpul.enabled) return;
    _ready = true;
    Devpul.plugin('devpul_riverpod', () => riverpodPlugin);
    try {
      developer.registerExtension('ext.devpul_riverpod.state', (_, _) async {
        return developer.ServiceExtensionResponse.result(
          jsonEncode({'providers': toJsonSafe(_live.values.toList())}),
        );
      });
    } catch (_) {
      // Already registered in this isolate.
    }
  }

  static bool _ready = false;

  // Live providers by id: their event fields and current value.
  static final _live = <String, Map<String, Object?>>{};
  static final _keys = Expando<Map<String, String>>();

  @override
  void didAddProvider(ProviderObserverContext context, Object? value) {
    final key = _key(context);
    _live[key['id']!] = {...key, 'value': value};
    Devpul.emit('riverpod.add', {...key, 'value': value});
  }

  @override
  void didUpdateProvider(
    ProviderObserverContext context,
    Object? previousValue,
    Object? newValue,
  ) {
    final key = _key(context);
    _live[key['id']!] = {...key, 'value': newValue};
    Devpul.emit('riverpod.update', {
      ...key,
      'previous': previousValue,
      'next': newValue,
    });
  }

  @override
  void didDisposeProvider(ProviderObserverContext context) {
    final key = _key(context);
    _live.remove(key['id']);
    Devpul.emit('riverpod.dispose', key);
  }

  @override
  void providerDidFail(
    ProviderObserverContext context,
    Object error,
    StackTrace stackTrace,
  ) {
    final key = _key(context);
    Devpul.error(
      error,
      stackTrace,
      source: 'riverpod',
      context: key['provider'],
    );
  }

  // Unnamed providers share a type name, so each instance also gets an id.
  static Map<String, String> _key(ProviderObserverContext context) {
    final provider = context.provider;
    return _keys[provider] ??= {
      'provider': [
        provider.name ?? provider.runtimeType.toString(),
        if (provider.argument != null) '(${provider.argument})',
      ].join(),
      'id': identityHashCode(provider).toRadixString(36),
    };
  }
}
