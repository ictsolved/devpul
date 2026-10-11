import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:go_router/go_router.dart';

/// Serves the app's [GoRouter] to the GoRouter tab.
abstract final class DevpulGoRouter {
  static GoRouter? _router;
  // The last event sent, encoded: go_router rebuilds equal match lists.
  static String? _sent;

  /// Lets the GoRouter tab show [router]'s routes, its location and match
  /// stack, and call `go`. Sends a `go_router.location` event on each change.
  /// Attaching another router replaces it. Does nothing unless
  /// [Devpul.included].
  static void attach(GoRouter router) {
    if (!Devpul.included) return;
    _router?.routerDelegate.removeListener(_changed);
    _router = router..routerDelegate.addListener(_changed);
    _sent = null;
    Devpul.handle(
      'go_router.state',
      (_) => {
        'routes': _routes(router.configuration.routes, ''),
        'current': _current(router.routerDelegate.currentConfiguration),
      },
    );
    Devpul.handle('go_router.go', (args) {
      final location = args['location'];
      if (location is! String || location.isEmpty) {
        throw const _GoRouterError('No location given.');
      }
      router.go(location);
      return null;
    });
    _changed();
  }

  static void _changed() {
    if (!Devpul.enabled) return;
    final matches = _router?.routerDelegate.currentConfiguration;
    final current = matches == null ? null : _current(matches);
    if (current == null) return;
    final encoded = jsonEncode(toJsonSafe(current));
    if (encoded == _sent) return;
    _sent = encoded;
    Devpul.emit('go_router.location', current);
  }

  static Map<String, Object?>? _current(RouteMatchList list) {
    if (list.matches.isEmpty && list.error == null) return null;
    return {
      'location': list.uri.toString(),
      'path': list.fullPath,
      'pathParameters': list.pathParameters,
      if (list.extra != null) 'extra': list.extra,
      if (list.error != null) 'error': list.error!.message,
      'matches': _matches(list.matches, '', 0).toList(),
    };
  }

  static Iterable<Map<String, Object?>> _matches(
    List<RouteMatchBase> matches,
    String parent,
    int depth,
  ) sync* {
    for (final match in matches) {
      if (match is ShellRouteMatch) {
        final route = match.route;
        yield {
          'depth': depth,
          'shell': route.runtimeType.toString(),
          if (route is StatefulShellRoute && match.matches.isNotEmpty)
            'branch': route.branches.indexWhere(
              (b) => b.routes.contains(match.matches.first.route),
            ),
        };
        yield* _matches(match.matches, parent, depth + 1);
      } else if (match is ImperativeRouteMatch) {
        yield {..._match(match, match.matches.fullPath, depth), 'pushed': true};
      } else if (match is RouteMatch) {
        parent = _join(parent, match.route.path);
        yield _match(match, parent, depth);
      }
    }
  }

  static Map<String, Object?> _match(
    RouteMatch match,
    String path,
    int depth,
  ) => {
    'depth': depth,
    'path': path,
    if (match.route.name != null) 'name': match.route.name,
    'location': match.matchedLocation,
  };

  static List<Map<String, Object?>> _routes(
    List<RouteBase> routes,
    String parent,
  ) => [for (final route in routes) _route(route, parent)];

  static Map<String, Object?> _route(RouteBase route, String parent) {
    if (route is GoRoute) {
      final path = _join(parent, route.path);
      return {
        'path': path,
        if (route.name != null) 'name': route.name,
        if (route.redirect != null) 'redirect': true,
        'routes': _routes(route.routes, path),
      };
    }
    if (route is StatefulShellRoute) {
      return {
        'shell': 'StatefulShellRoute',
        'branches': [
          for (final branch in route.branches) _routes(branch.routes, parent),
        ],
      };
    }
    return {
      'shell': route.runtimeType.toString(),
      'routes': _routes(route.routes, parent),
    };
  }

  // Sub-route paths are relative; top-level ones, also under shells, start
  // with a slash.
  static String _join(String parent, String path) {
    if (path.startsWith('/') || parent.isEmpty) return path;
    return parent.endsWith('/') ? '$parent$path' : '$parent/$path';
  }
}

final class _GoRouterError implements Exception {
  const _GoRouterError(this.message);

  final String message;

  @override
  String toString() => message;
}
