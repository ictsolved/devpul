import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('reports Flutter and platform errors and keeps previous handlers', () {
    final events = <(String, Map<String, Object?>)>[];
    debugOnPost = (kind, event) => events.add((kind, event));
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));

    final flutterSeen = <FlutterErrorDetails>[];
    final originalFlutter = FlutterError.onError;
    final originalPlatform = PlatformDispatcher.instance.onError;
    FlutterError.onError = flutterSeen.add;
    PlatformDispatcher.instance.onError = (_, __) => true;
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
    expect(events[1].$2['source'], 'platform');
    expect(events[1].$2['type'], 'ArgumentError');
  });
}
