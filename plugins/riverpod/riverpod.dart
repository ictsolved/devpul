import 'package:devpul/devpul.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart';

const _debug =
    !bool.fromEnvironment('dart.vm.product') &&
    !bool.fromEnvironment('dart.vm.profile');

/// Observers that send provider changes to DevPul for the Riverpod tab, or
/// none in release and profile builds.
///
/// Providers left out by [include], [exclude] or [filter] send nothing.
/// [include] and [exclude] take providers and families.
///
/// ```dart
/// ProviderScope(observers: devpulRiverpodObservers(), child: app)
/// ```
List<ProviderObserver> devpulRiverpodObservers({
  List<ProviderOrFamily>? include,
  List<ProviderOrFamily> exclude = const [],
  bool Function(ProviderBase<Object?> provider)? filter,
}) {
  if (!_debug) return const [];
  bool matches(List<ProviderOrFamily> list, ProviderBase<Object?> provider) =>
      list.contains(provider) || list.contains(provider.from);
  return [
    _Observer(
      (provider) =>
          (include == null || matches(include, provider)) &&
          !matches(exclude, provider) &&
          (filter?.call(provider) ?? true),
    ),
  ];
}

final class _Observer extends ProviderObserver {
  _Observer(this._shows) {
    Devpul.handle('riverpod.state', (_) => {'providers': _live.values});
  }

  final bool Function(ProviderBase<Object?> provider) _shows;

  // Live providers by id: their event fields and current value.
  static final _live = <String, Map<String, Object?>>{};
  static final _keys = Expando<Map<String, String>>();

  @override
  void didAddProvider(ProviderObserverContext context, Object? value) {
    if (!_shows(context.provider)) return;
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
    if (!_shows(context.provider)) return;
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
    if (!_shows(context.provider)) return;
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
    if (!_shows(context.provider)) return;
    Devpul.error(
      error,
      stackTrace,
      source: 'riverpod',
      context: _key(context)['provider'],
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
