import 'dart:async';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../devpul/test/golden.dart';

// The kinds devpul_flutter posts, in the shape ext.devpul.backlog serves.
void main() {
  testWidgets('events match contract/flutter.json', (tester) async {
    final events = <Map<String, Object?>>[];
    debugOnPost = (kind, event) {
      if (kind == 'route' || kind == 'error') {
        events.add({'kind': 'devpul.$kind', 'data': event});
      }
    };
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    final original = FlutterError.onError;
    addTearDown(() => FlutterError.onError = original);
    FlutterError.onError = (_) {};
    DevpulFlutter.install();

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
    unawaited(key.currentState!.pushReplacementNamed('/checkout'));
    await tester.pumpAndSettle();
    key.currentState!.pop();
    await tester.pumpAndSettle();

    FlutterError.reportError(
      FlutterErrorDetails(
        exception: StateError('layout'),
        stack: StackTrace.fromString('#0      build (file:///app.dart:1:1)'),
        library: 'rendering library',
        context: ErrorDescription('during layout'),
        informationCollector: () => [ErrorDescription('widget: Cart')],
      ),
    );

    expectGolden('flutter.json', normalize(events, 'f1'));
  });
}
