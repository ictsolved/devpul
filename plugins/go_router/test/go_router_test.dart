import 'dart:async';

import 'package:devpul/devpul.dart';
// ignore: implementation_imports
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunCall;
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import '../go_router.dart';

void main() {
  late GoRouter router;
  late List<Map<String, Object?>> sent;

  Widget page(BuildContext _, GoRouterState state) =>
      Text(state.uri.toString());

  setUp(() {
    sent = [];
    debugOnPost = (kind, event) {
      if (kind == 'go_router.location') {
        sent.add(event['data']! as Map<String, Object?>);
      }
    };
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(
          path: '/',
          builder: page,
          routes: [GoRoute(path: 'items/:id', name: 'item', builder: page)],
        ),
        ShellRoute(
          builder: (_, _, child) => child,
          routes: [GoRoute(path: '/shell', builder: page)],
        ),
        StatefulShellRoute.indexedStack(
          builder: (_, _, shell) => shell,
          branches: [
            StatefulShellBranch(
              routes: [GoRoute(path: '/a', builder: page)],
            ),
            StatefulShellBranch(
              routes: [
                GoRoute(path: '/b', builder: page, redirect: (_, _) => null),
              ],
            ),
          ],
        ),
      ],
    );
  });

  tearDown(() {
    debugOnPost = null;
    router.dispose();
  });

  Future<void> pump(WidgetTester tester) async {
    await tester.pumpWidget(
      WidgetsApp.router(color: const Color(0xFF000000), routerConfig: router),
    );
    DevpulGoRouter.attach(router);
  }

  testWidgets('lists routes with full paths', (tester) async {
    await pump(tester);
    final state = await debugRunCall('go_router.state') as Map;
    expect(state['routes'], [
      {
        'path': '/',
        'routes': [
          {'path': '/items/:id', 'name': 'item', 'routes': <Object?>[]},
        ],
      },
      {
        'shell': 'ShellRoute',
        'routes': [
          {'path': '/shell', 'routes': <Object?>[]},
        ],
      },
      {
        'shell': 'StatefulShellRoute',
        'branches': [
          [
            {'path': '/a', 'routes': <Object?>[]},
          ],
          [
            {'path': '/b', 'redirect': true, 'routes': <Object?>[]},
          ],
        ],
      },
    ]);
    expect((state['current'] as Map)['location'], '/');
  });

  testWidgets('sends the match stack on each change', (tester) async {
    await pump(tester);
    expect(sent.single['location'], '/');

    await debugRunCall('go_router.go', {'location': '/items/7?tab=info'});
    await tester.pumpAndSettle();
    expect(sent.last, {
      'location': '/items/7?tab=info',
      'path': '/items/:id',
      'pathParameters': {'id': '7'},
      'matches': [
        {'depth': 0, 'path': '/', 'location': '/'},
        {
          'depth': 0,
          'path': '/items/:id',
          'name': 'item',
          'location': '/items/7',
        },
      ],
    });

    router.go('/b');
    await tester.pumpAndSettle();
    expect(sent.last['matches'], [
      {'depth': 0, 'shell': 'StatefulShellRoute', 'branch': 1},
      {'depth': 1, 'path': '/b', 'location': '/b'},
    ]);

    unawaited(router.push('/shell', extra: {'from': 'test'}));
    await tester.pumpAndSettle();
    expect(sent.last['location'], '/b');
    expect(sent.last['extra'], null);
    expect((sent.last['matches']! as List).last, {
      'depth': 1,
      'path': '/shell',
      'location': '/shell',
      'pushed': true,
    });

    router.pop();
    await tester.pumpAndSettle();
    expect(sent.last['matches'], [
      {'depth': 0, 'shell': 'StatefulShellRoute', 'branch': 1},
      {'depth': 1, 'path': '/b', 'location': '/b'},
    ]);

    final count = sent.length;
    router.refresh();
    await tester.pumpAndSettle();
    expect(sent, hasLength(count));
  });

  testWidgets('reports a location that matches nothing', (tester) async {
    await pump(tester);
    router.go('/nowhere');
    await tester.pumpAndSettle();
    expect(sent.last['location'], '/nowhere');
    expect(sent.last['error'], contains('/nowhere'));
    expect(sent.last['matches'], isEmpty);
  });

  testWidgets('refuses go without a location', (tester) async {
    await pump(tester);
    await expectLater(
      debugRunCall('go_router.go', {'location': ''}),
      throwsA(
        isA<Exception>().having((e) => '$e', 'message', 'No location given.'),
      ),
    );
  });
}
