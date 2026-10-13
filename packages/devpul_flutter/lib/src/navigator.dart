import 'package:devpul/devpul.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';

import 'inspector.dart';
import 'routes_plugin.dart';

/// Emits a `route` event for each push, pop, replace and remove, and offers
/// the UI a Routes tab that shows the stack after each one.
///
/// A route without a name shows its screen widget, such as `HomePage`, when
/// widget creation is tracked (debug default), else its type. The top route
/// goes out with each error as `route`.
///
/// ```dart
/// MaterialApp(navigatorObservers: [DevpulNavigatorObserver()])
/// ```
class DevpulNavigatorObserver extends NavigatorObserver {
  DevpulNavigatorObserver() {
    // Keeps the Routes module out of builds without DevPul: dart2js keeps
    // the closure passed to Devpul.plugin otherwise.
    if (!Devpul.included) return;
    Devpul.route ??= _top;
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
      _add('push', route, previousRoute);

  @override
  void didPop(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _add('pop', route, previousRoute);

  @override
  void didRemove(Route<dynamic> route, Route<dynamic>? previousRoute) =>
      _add('remove', route, previousRoute);

  @override
  void didReplace({Route<dynamic>? newRoute, Route<dynamic>? oldRoute}) {
    if (newRoute != null) _add('replace', newRoute, oldRoute);
  }
}

typedef _Change = (String action, Route<dynamic> route, Route<dynamic>? other);

// Shared by every observer so nested navigators keep their order.
final _pending = <_Change>[];
final _stack = <Route<dynamic>>[];
final _names = Expando<String>();
var _scheduled = false;

// An unnamed route has no widgets until its first frame, so its event and
// every later one wait for the end of that frame.
void _add(String action, Route<dynamic> route, Route<dynamic>? other) {
  if (!Devpul.enabled) return;
  _pending.add((action, route, other));
  final wait =
      (action == 'push' || action == 'replace') &&
      route is ModalRoute &&
      route.settings.name == null &&
      creationTracked;
  if (!wait && _pending.length == 1) {
    flushRoutes();
  } else if (!_scheduled) {
    _scheduled = true;
    SchedulerBinding.instance.addPostFrameCallback((_) => flushRoutes());
  }
}

/// Sends the route events held for a first frame. [building] is an element
/// in the middle of a build, such as one that threw.
void flushRoutes([Element? building]) {
  _scheduled = false;
  if (_pending.isEmpty) return;
  final changes = [..._pending];
  _pending.clear();
  for (final (action, route, other) in changes) {
    Devpul.emit('route', {
      'action': action,
      'route': _name(route, building),
      'previous': other == null ? null : _name(other, building),
      if (route.settings.arguments != null)
        'arguments': route.settings.arguments,
    });
    _track(action, route, other);
  }
}

// The stack the Routes tab shows, across navigators. A navigator disposed
// with its routes, such as a shell's, sends no pops; its routes go inactive.
String? _top() {
  for (final route in _stack.reversed) {
    if (route.isActive) return _names[route];
  }
  return null;
}

void _track(String action, Route<dynamic> route, Route<dynamic>? other) {
  _stack.removeWhere((r) => !r.isActive);
  switch (action) {
    case 'push':
      _stack.add(route);
    case 'pop' || 'remove':
      _stack.remove(route);
    case 'replace':
      final i = other == null ? -1 : _stack.indexOf(other);
      if (i < 0) {
        _stack.add(route);
      } else {
        _stack[i] = route;
      }
  }
}

// Fixed at the first event that names the route, so the stack lines up.
String _name(Route<dynamic> route, Element? building) => _names[route] ??=
    route.settings.name ??
    _widgetName(route, building) ??
    '${route.runtimeType}';

String? _widgetName(Route<dynamic> route, Element? building) {
  if (route is! ModalRoute || !creationTracked) return null;
  try {
    final root = route.subtreeContext;
    if (root is! Element) return null;
    final page = building == null ? null : localOnPath(root, building);
    return (page ?? localDescendant(root))?.widget.runtimeType.toString();
  } catch (_) {
    return null;
  }
}
