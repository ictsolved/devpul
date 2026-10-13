import 'dart:async';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost, debugPluginSource;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('reports Flutter and platform errors and keeps previous handlers', () {
    final events = <(String, Map<String, Object?>)>[];
    debugOnPost = (kind, event) =>
        events.add((kind, event['data']! as Map<String, Object?>));
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));

    final flutterSeen = <FlutterErrorDetails>[];
    final originalFlutter = FlutterError.onError;
    final originalPlatform = PlatformDispatcher.instance.onError;
    FlutterError.onError = flutterSeen.add;
    PlatformDispatcher.instance.onError = (_, _) => true;
    addTearDown(() {
      FlutterError.onError = originalFlutter;
      PlatformDispatcher.instance.onError = originalPlatform;
    });

    DevpulFlutter.install();
    DevpulFlutter.install();

    FlutterError.reportError(
      FlutterErrorDetails(
        exception: StateError('layout'),
        stack: StackTrace.current,
        library: 'rendering library',
        context: ErrorDescription('during layout'),
        informationCollector: () => [ErrorHint('The widget was Foo')],
        silent: true,
      ),
    );
    final handled = PlatformDispatcher.instance.onError!(
      ArgumentError('async'),
      StackTrace.current,
    );

    expect(flutterSeen, hasLength(1));
    expect(handled, isTrue);
    expect(events.map((e) => e.$1), ['error', 'error']);
    expect(events[0].$2['source'], 'flutter');
    expect(events[0].$2['library'], 'rendering library');
    expect(events[0].$2['context'], 'during layout');
    expect(events[0].$2['information'], 'The widget was Foo');
    expect(events[0].$2['silent'], isTrue);
    expect(events[1].$2['source'], 'platform');
    expect(events[1].$2['type'], 'ArgumentError');
  });

  test('captures debugPrint and still prints', () {
    final events = <(String, Map<String, Object?>)>[];
    debugOnPost = (kind, event) =>
        events.add((kind, event['data']! as Map<String, Object?>));
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    final printed = <String?>[];
    final original = debugPrint;
    debugPrint = (message, {wrapWidth}) => printed.add(message);
    addTearDown(() => debugPrint = original);

    DevpulFlutter.captureDebugPrint();
    debugPrint('hello');

    expect(printed, ['hello']);
    expect(events.single.$1, 'log');
    expect(events.single.$2, containsPair('message', 'hello'));
    expect(events.single.$2, containsPair('level', 'debug'));
  });

  testWidgets('route observer emits navigation', (tester) async {
    final events = <(String, Map<String, Object?>)>[];
    debugOnPost = (kind, event) =>
        events.add((kind, event['data']! as Map<String, Object?>));
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    final key = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      WidgetsApp(
        navigatorKey: key,
        color: const Color(0xFF000000),
        navigatorObservers: [DevpulNavigatorObserver()],
        onGenerateRoute: (settings) => PageRouteBuilder<void>(
          settings: settings,
          pageBuilder: (_, _, _) => const SizedBox(),
        ),
      ),
    );
    unawaited(key.currentState!.pushNamed('/cart', arguments: {'id': 3}));
    await tester.pumpAndSettle();
    expect(Devpul.route?.call(), '/cart');
    key.currentState!.pop();
    await tester.pumpAndSettle();
    expect(Devpul.route?.call(), '/');

    final routes = events.where((e) => e.$1 == 'route').map((e) => e.$2);
    expect(routes.map((e) => [e['action'], e['route'], e['previous']]), [
      ['push', '/', null],
      ['push', '/cart', '/'],
      ['pop', '/cart', '/'],
    ]);
    expect(routes.elementAt(1)['arguments'], {'id': 3});

    final info = events.lastWhere((e) => e.$1 == 'app.info').$2;
    expect(info['plugins'], [
      {
        'id': 'routes',
        'origin': 'devpul_flutter',
        'description': 'The navigator stack after each route change.',
        'hash': matches(RegExp(r'^[0-9a-f]{64}$')),
      },
    ]);
    expect(debugPluginSource('routes'), contains("id: 'routes'"));
  });

  testWidgets('the route at an error skips a disposed nested navigator', (
    tester,
  ) async {
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    final key = GlobalKey<NavigatorState>();
    final inner = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      WidgetsApp(
        navigatorKey: key,
        color: const Color(0xFF000000),
        navigatorObservers: [DevpulNavigatorObserver()],
        onGenerateRoute: (settings) => PageRouteBuilder<void>(
          settings: settings,
          pageBuilder: (_, _, _) => settings.name == '/shell'
              ? Navigator(
                  key: inner,
                  observers: [DevpulNavigatorObserver()],
                  onGenerateRoute: (settings) => PageRouteBuilder<void>(
                    settings: RouteSettings(name: '/shell${settings.name}'),
                    pageBuilder: (_, _, _) => const SizedBox(),
                  ),
                )
              : const SizedBox(),
        ),
      ),
    );
    unawaited(key.currentState!.pushNamed('/shell'));
    await tester.pumpAndSettle();
    unawaited(inner.currentState!.pushNamed('/items'));
    await tester.pumpAndSettle();
    expect(Devpul.route?.call(), '/shell/items');

    key.currentState!.pop();
    await tester.pumpAndSettle();
    expect(Devpul.route?.call(), '/');
  });
}
