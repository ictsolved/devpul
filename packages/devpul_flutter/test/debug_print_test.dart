import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  test('leaves Flutter error reports out of debugPrint capture', () {
    final events = <(String, Map<String, Object?>)>[];
    debugOnPost = (kind, event) =>
        events.add((kind, event['data']! as Map<String, Object?>));
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    final printed = <String?>[];
    final originalPrint = debugPrint;
    final originalError = FlutterError.onError;
    debugPrint = (message, {wrapWidth}) => printed.add(message);
    // The test binding replaces presentError; this is what apps print with.
    FlutterError.onError = FlutterError.dumpErrorToConsole;
    FlutterError.resetErrorCount();
    addTearDown(() {
      debugPrint = originalPrint;
      FlutterError.onError = originalError;
    });

    DevpulFlutter.install();
    DevpulFlutter.captureDebugPrint();
    for (var i = 0; i < 2; i++) {
      FlutterError.reportError(
        FlutterErrorDetails(exception: StateError('build $i')),
      );
    }
    debugPrint('after');

    expect(printed.join('\n'), contains('EXCEPTION CAUGHT'));
    expect(printed.join('\n'), contains('Another exception was thrown'));
    expect(events.map((e) => e.$1), ['error', 'error', 'log']);
    expect(events.last.$2, containsPair('message', 'after'));
  });
}
