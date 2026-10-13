import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart'
    show debugInfo, debugOnPost, debugPluginSource, debugRunCall;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

const _reset = {
  'textScale': null,
  'brightness': null,
  'locale': null,
  'boldText': null,
  'disableAnimations': null,
};

void main() {
  late List<Map<String, Object?>> events;
  late BuildContext seen;
  final page = GlobalKey<_PageState>();

  setUp(() {
    events = [];
    debugOnPost = (kind, event) {
      if (kind == 'overrides') {
        events.add(event['data']! as Map<String, Object?>);
      }
    };
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
  });

  tearDown(() async {
    await debugRunCall('overrides.set', _reset);
    debugOnPost = null;
  });

  Widget app({ThemeMode? themeMode}) => MaterialApp(
    builder: DevpulApp.builder,
    theme: ThemeData(brightness: Brightness.light),
    darkTheme: ThemeData(brightness: Brightness.dark),
    themeMode: themeMode,
    supportedLocales: const [Locale('en', 'US'), Locale('de')],
    home: _Page(key: page, onBuild: (context) => seen = context),
  );

  testWidgets('applies overrides below the app and keeps its state', (
    tester,
  ) async {
    await tester.pumpWidget(app());
    final state = page.currentState;

    expect(await debugRunCall('overrides.state'), {
      'overrides': <String, Object?>{},
      'system': {
        'textScale': 1.0,
        'brightness': 'light',
        'locale': 'en-US',
        'boldText': false,
        'disableAnimations': false,
      },
      'locales': ['en-US', 'de'],
      'themeMode': 'system',
    });

    final result =
        await debugRunCall('overrides.set', {
              'textScale': 2,
              'brightness': 'dark',
              'locale': 'de',
              'boldText': true,
              'disableAnimations': true,
            })
            as Map<String, Object?>;
    expect(result['overrides'], {
      'textScale': 2.0,
      'brightness': 'dark',
      'locale': 'de',
      'boldText': true,
      'disableAnimations': true,
    });
    await tester.pumpAndSettle();

    final media = MediaQuery.of(seen);
    expect(media.textScaler.scale(10), 20);
    expect(media.platformBrightness, Brightness.dark);
    expect(media.boldText, isTrue);
    expect(media.disableAnimations, isTrue);
    expect(Localizations.localeOf(seen), const Locale('de'));
    expect(Theme.of(seen).brightness, Brightness.dark);
    expect(page.currentState, same(state));

    await debugRunCall('overrides.set', {'brightness': null, 'locale': null});
    await tester.pumpAndSettle();
    expect(Theme.of(seen).brightness, Brightness.light);
    expect(Localizations.localeOf(seen), const Locale('en', 'US'));
    expect(MediaQuery.of(seen).boldText, isTrue);

    expect(events.first, {
      'textScale': 1.0,
      'brightness': 'light',
      'locale': 'en-US',
      'boldText': false,
      'disableAnimations': false,
    });
    expect(events[1], {
      'textScale': 2.0,
      'brightness': 'dark',
      'locale': 'de',
      'boldText': true,
      'disableAnimations': true,
      'overridden': [
        'textScale',
        'brightness',
        'locale',
        'boldText',
        'disableAnimations',
      ],
    });
    expect(events.last['overridden'], [
      'textScale',
      'boldText',
      'disableAnimations',
    ]);
  });

  testWidgets('keeps a themeMode the app sets', (tester) async {
    await tester.pumpWidget(app(themeMode: ThemeMode.light));
    await debugRunCall('overrides.set', {'brightness': 'dark'});
    await tester.pumpAndSettle();

    expect(MediaQuery.platformBrightnessOf(seen), Brightness.dark);
    expect(Theme.of(seen).brightness, Brightness.light);
    final state = await debugRunCall('overrides.state') as Map<String, Object?>;
    expect(state['themeMode'], 'light');
  });

  testWidgets('applies brightness in a CupertinoApp', (tester) async {
    await tester.pumpWidget(
      CupertinoApp(
        builder: DevpulApp.builder,
        home: _Page(onBuild: (context) => seen = context),
      ),
    );
    await debugRunCall('overrides.set', {'brightness': 'dark'});
    await tester.pumpAndSettle();

    expect(CupertinoTheme.brightnessOf(seen), Brightness.dark);
    final state = await debugRunCall('overrides.state') as Map<String, Object?>;
    expect(state.containsKey('themeMode'), isFalse);
  });

  testWidgets('refuses bad values and keeps the overrides set', (tester) async {
    await tester.pumpWidget(app());
    await debugRunCall('overrides.set', {'textScale': 1.5});

    Future<String> refused(Map<String, Object?> args) async {
      try {
        await debugRunCall('overrides.set', {'boldText': true, ...args});
      } catch (e) {
        return '$e';
      }
      fail('accepted $args');
    }

    expect(await refused({'locale': 'fr'}), 'The app supports en-US, de.');
    expect(
      await refused({'brightness': 'dim'}),
      'brightness is light or dark.',
    );
    expect(await refused({'textScale': 0}), 'textScale is a number up to 10.');
    expect(await refused({'boldText': 'yes'}), 'boldText is true or false.');
    expect(await refused({'zoom': 2}), startsWith('No override named zoom.'));
    final state = await debugRunCall('overrides.state') as Map<String, Object?>;
    expect(state['overrides'], {'textScale': 1.5});
  });

  testWidgets('offers the Overrides tab and its handlers', (tester) async {
    await tester.pumpWidget(app());
    final info = debugInfo();

    expect(
      (info['plugins']! as List).cast<Map<String, Object?>>().where(
        (p) => p['id'] == 'overrides',
      ),
      [containsPair('origin', 'devpul_flutter')],
    );
    expect(debugPluginSource('overrides'), contains("id: 'overrides'"));
    final handlers = (info['handlers']! as List).cast<Map<String, Object?>>();
    expect(
      handlers.where((h) => h['name'] == 'overrides.set').single['sensitive'],
      isTrue,
    );
    expect(handlers.map((h) => h['name']), contains('overrides.state'));
  });
}

class _Page extends StatefulWidget {
  const _Page({super.key, required this.onBuild});

  final void Function(BuildContext context) onBuild;

  @override
  State<_Page> createState() => _PageState();
}

class _PageState extends State<_Page> {
  @override
  Widget build(BuildContext context) {
    widget.onBuild(context);
    return const SizedBox();
  }
}
