import 'package:devpul/devpul.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

// Run by capture_test.dart with flutter_test_config.dart beside it.
void main() {
  testWidgets('counts taps', (tester) async {
    await tester.pumpWidget(
      MaterialApp(
        navigatorObservers: [DevpulNavigatorObserver()],
        home: Builder(
          builder: (context) => TextButton(
            onPressed: () => Devpul.log('tapped'),
            child: const Text('Tap'),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Tap'));
    expect(find.text('1'), findsOneWidget);
  });

  testWidgets('throws while building', (tester) async {
    await tester.pumpWidget(
      MaterialApp(home: Builder(builder: (_) => throw StateError('no cart'))),
    );
  });
}
