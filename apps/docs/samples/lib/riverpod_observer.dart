import 'package:devpul/devpul.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final class DevpulProviderObserver extends ProviderObserver {
  @override
  void didUpdateProvider(
    ProviderObserverContext context,
    Object? previousValue,
    Object? newValue,
  ) {
    Devpul.emit('riverpod.update', {
      'provider': _name(context),
      'previous': previousValue,
      'next': newValue,
    });
  }

  @override
  void didDisposeProvider(ProviderObserverContext context) {
    Devpul.emit('riverpod.dispose', {'provider': _name(context)});
  }

  @override
  void providerDidFail(
    ProviderObserverContext context,
    Object error,
    StackTrace stackTrace,
  ) {
    Devpul.error(
      error,
      stackTrace,
      source: 'riverpod',
      context: _name(context),
    );
  }

  String _name(ProviderObserverContext context) =>
      context.provider.name ?? context.provider.runtimeType.toString();
}
