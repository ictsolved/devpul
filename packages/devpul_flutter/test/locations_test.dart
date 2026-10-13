import 'dart:async';
import 'dart:io';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

// Run by check_dart.sh with and without --track-widget-creation.
void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  final original = FlutterError.onError;
  FlutterError.onError = null;
  DevpulFlutter.install();
  final report = FlutterError.onError!;
  FlutterError.onError = original;

  final tracked = WidgetInspectorService.instance.isWidgetCreationTracked();
  late List<(String, Map<String, Object?>)> events;
  late GlobalKey<NavigatorState> key;

  setUp(() {
    events = [];
    debugOnPost = (kind, event) {
      if (kind == 'route' || kind == 'error') {
        events.add((kind, event['data']! as Map<String, Object?>));
      }
    };
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    key = GlobalKey<NavigatorState>();
  });

  Future<void> pumpApp(WidgetTester tester) async {
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
    events.clear();
  }

  Route<void> unnamed(Widget page) =>
      PageRouteBuilder<void>(pageBuilder: (_, _, _) => page);

  List<List<Object?>> routes() => [
    for (final (kind, data) in events)
      if (kind == 'route') [data['action'], data['route'], data['previous']],
  ];

  testWidgets('unnamed routes show their screen widget', (tester) async {
    await pumpApp(tester);
    final type = 'PageRouteBuilder<void>';
    final cart = tracked ? 'CartPage' : type;

    unawaited(key.currentState!.push(unnamed(const CartPage())));
    expect(routes(), tracked ? isEmpty : hasLength(1));
    await tester.pumpAndSettle();
    unawaited(key.currentState!.pushNamed('/done'));
    unawaited(key.currentState!.push(unnamed(const PayPage())));
    key.currentState!.pop();
    await tester.pumpAndSettle();
    key.currentState!.pop();
    await tester.pumpAndSettle();

    expect(routes(), [
      ['push', cart, '/'],
      ['push', '/done', cart],
      // Popped before its first frame: no widgets to name it by.
      ['push', type, '/done'],
      ['pop', type, '/done'],
      ['pop', '/done', cart],
    ]);
  });

  testWidgets('a build error names its widget and location', (tester) async {
    await pumpApp(tester);
    final previous = FlutterError.onError;
    FlutterError.onError = report;
    unawaited(key.currentState!.push(unnamed(const BrokenPage())));
    await tester.pump();
    FlutterError.onError = previous;

    expect(events.map((e) => e.$1), ['route', 'error']);
    expect(events[0].$2['route'], tracked ? 'BrokenPage' : isNot('BrokenPage'));
    final error = events[1].$2;
    expect(error['type'], 'StateError');
    if (tracked) {
      final lines = File('test/locations_test.dart').readAsLinesSync();
      final line = lines.lastIndexWhere((l) => l.contains('child: Broken()'));
      expect(error['widget'], 'Broken');
      expect(error['location'], {
        'file': Uri.file(
          File('test/locations_test.dart').absolute.path,
        ).toString(),
        'line': line + 1,
        'column': lines[line].indexOf('Broken()') + 1,
      });
      expect(
        error['information'],
        contains('The relevant error-causing widget was'),
      );
    } else {
      expect(error.keys, isNot(contains('widget')));
      expect(error.keys, isNot(contains('location')));
      expect(error['information'], contains('--track-widget-creation'));
    }
  });
}

class CartPage extends StatelessWidget {
  const CartPage({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox();
}

class PayPage extends StatelessWidget {
  const PayPage({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox();
}

class BrokenPage extends StatelessWidget {
  const BrokenPage({super.key});

  @override
  Widget build(BuildContext context) => const Center(child: Broken());
}

class Broken extends StatelessWidget {
  const Broken({super.key});

  @override
  Widget build(BuildContext context) => throw StateError('build');
}
