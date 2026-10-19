import 'dart:async';

import 'package:devpul/devpul.dart';
// ignore: implementation_imports
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunCall;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';

import '../app_links.dart';

const _channel = MethodChannel('com.llfbandit.app_links/messages');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late List<Map<String, Object?>> sent;
  String? initial;

  setUp(() {
    sent = [];
    initial = null;
    debugOnPost = (kind, event) {
      if (kind == 'app_links.link') {
        sent.add(event['data']! as Map<String, Object?>);
      }
    };
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          _channel,
          (call) async => call.method == 'getInitialLink' ? initial : null,
        );
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
  });

  tearDown(() {
    debugOnPost = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, null);
  });

  test('sends each link, then passes it on', () async {
    final source = StreamController<Uri>.broadcast();
    final seen = <Uri>[];
    final sub = DevpulAppLinks.wrap(source.stream).listen(seen.add);
    source.add(Uri.parse('example://items/1?ref=mail'));
    await pumpEventQueue();
    expect(seen, [Uri.parse('example://items/1?ref=mail')]);
    expect(sent, [
      {'link': 'example://items/1?ref=mail'},
    ]);
    await sub.cancel();
    expect(source.hasListener, isFalse);
  });

  test('passes errors and done on', () async {
    final source = StreamController<Uri>();
    final errors = <Object>[];
    final done = Completer<void>();
    DevpulAppLinks.wrap(
      source.stream,
    ).listen(null, onError: errors.add, onDone: done.complete);
    source.addError(const FormatException('bad'));
    await source.close();
    await done.future;
    expect(errors, [isA<FormatException>()]);
  });

  test('reports the launch link', () async {
    DevpulAppLinks.wrap(const Stream.empty());
    expect(await debugRunCall('app_links.initial'), <String, Object?>{});
    initial = 'example://items/2';
    expect(await debugRunCall('app_links.initial'), {
      'link': 'example://items/2',
    });
  });

  test('opens a test link on every listening stream', () async {
    final first = <Uri>[];
    final second = <Uri>[];
    final a = DevpulAppLinks.wrap(_open()).listen(first.add);
    final b = DevpulAppLinks.wrap(_open()).listen(second.add);
    await expectLater(
      debugRunCall('app_links.open', {'link': 'example://x'}),
      throwsA(anything),
    );

    await debugRunCall('app_links.open', {
      'link': ' example://items/3#top ',
    }, true);
    await pumpEventQueue();
    expect(first, [Uri.parse('example://items/3#top')]);
    expect(second, first);
    expect(sent, [
      {'link': 'example://items/3#top', 'devpul': true},
    ]);
    await a.cancel();
    await b.cancel();
  });

  test('refuses a link when nothing listens', () async {
    final sub = DevpulAppLinks.wrap(_open()).listen(null);
    await sub.cancel();
    final ended = Completer<void>();
    DevpulAppLinks.wrap(
      const Stream.empty(),
    ).listen(null, onDone: ended.complete);
    await ended.future;
    await expectLater(
      debugRunCall('app_links.open', {'link': 'example://x'}, true),
      throwsA(predicate((e) => '$e'.contains('Nothing listens'))),
    );
    expect(sent, isEmpty);
  });

  test('refuses what is not a link', () async {
    final sub = DevpulAppLinks.wrap(_open()).listen(null);
    await expectLater(
      debugRunCall('app_links.open', {'link': ' '}, true),
      throwsA(predicate((e) => '$e'.contains('No link given.'))),
    );
    await expectLater(
      debugRunCall('app_links.open', {'link': 'example://[x'}, true),
      throwsA(predicate((e) => '$e'.contains('Not a link'))),
    );
    await sub.cancel();
  });
}

// A link stream that never ends, as the platform's.
Stream<Uri> _open() => StreamController<Uri>.broadcast().stream;
