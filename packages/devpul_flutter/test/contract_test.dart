import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

import '../../devpul/test/golden.dart';

// The kinds devpul_flutter posts, in the shape ext.devpul.backlog serves.
void main() {
  testWidgets('events match contract/flutter.json', (tester) async {
    final events = <Map<String, Object?>>[];
    debugOnPost = (kind, event) {
      if (kind == 'route' || kind == 'lifecycle' || kind == 'error') {
        events.add({'kind': 'devpul.$kind', 'data': event});
      }
    };
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    final original = FlutterError.onError;
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
    tester.binding
      ..handleAppLifecycleStateChanged(AppLifecycleState.inactive)
      ..handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    unawaited(
      key.currentState!.push(
        PageRouteBuilder<void>(pageBuilder: (_, _, _) => const Cart()),
      ),
    );
    await tester.pumpAndSettle();

    final cart = tester.element(find.byType(Cart));
    FlutterError.reportError(
      FlutterErrorDetails(
        exception: StateError('layout'),
        stack: StackTrace.fromString('#0      build (file:///app.dart:1:1)'),
        library: 'rendering library',
        context: ErrorDescription('during layout'),
        informationCollector: () => [
          DiagnosticsDebugCreator(DebugCreator(cart)),
        ],
      ),
    );
    FlutterError.onError = original;

    final dir = Directory.current.uri.toString();
    expectGolden(
      'flutter.json',
      normalize(
        jsonDecode(jsonEncode(events).replaceAll(dir, 'file:///app/')),
        'f1',
      ),
    );
  });
}

class Cart extends StatelessWidget {
  const Cart({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox();
}
