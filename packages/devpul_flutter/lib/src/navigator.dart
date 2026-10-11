import 'package:devpul/devpul.dart';
import 'package:flutter/widgets.dart';

import 'routes_plugin.dart';

/// Emits a `route` event for each push, pop, replace and remove, and offers
/// the UI a Routes tab that shows the stack after each one.
///
/// ```dart
/// MaterialApp(navigatorObservers: [DevpulNavigatorObserver()])
/// ```
class DevpulNavigatorObserver extends NavigatorObserver {
  DevpulNavigatorObserver() {
    if (_offered) return;
    _offered = true;
    Devpul.plugin(
      'routes',
      () => routesPlugin,
      origin: 'devpul_flutter',
      description: 'The navigator stack after each route change.',
    );
  }

  static bool _offered = false;

  @override
  void didPush(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _emit('push', route, previousRoute);

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _emit('pop', route, previousRoute);

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _emit('remove', route, previousRoute);

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (newRoute != null) _emit('replace', newRoute, oldRoute);
  }

  static void _emit(
    String action,
    Route<dynamic> route,
    Route<dynamic>? other,
  ) {
    if (!Devpul.enabled) return;
    Devpul.emit('route', {
      'action': action,
      'route': _name(route),
      'previous': other == null ? null : _name(other),
      if (route.settings.arguments != null)
        'arguments': route.settings.arguments,
    });
  }

  static String _name(Route<dynamic> route) =>
      route.settings.name ?? route.runtimeType.toString();
}
