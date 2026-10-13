import 'dart:async';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/console.dart';
import 'package:test/test.dart';

Future<List<String>> capture(void Function() body) async {
  final lines = <String>[];
  await runZoned(
    () async {
      body();
      // Browsers clamp nested timers to 4 ms, so wait for the queue to drain.
      var last = -1;
      while (lines.length != last) {
        last = lines.length;
        await Future<void>.delayed(const Duration(milliseconds: 50));
      }
    },
    zoneSpecification: ZoneSpecification(
      print: (_, _, _, line) => lines.add(line),
    ),
  );
  return lines;
}

void main() {
  test('single line prints name and content together', () async {
    final lines = await capture(() => DevpulConsole.write('#1 <', '200 GET'));
    expect(lines, ['#1 < 200 GET']);
  });

  test('multi line prints the name first', () async {
    final lines = await capture(() => DevpulConsole.write('#2 >', 'a\nb'));
    expect(lines, ['#2 >', 'a', 'b']);
  });

  test('keeps order across callers', () async {
    final lines = await capture(() {
      for (var i = 0; i < 20; i++) {
        DevpulConsole.write('#$i', 'x\ny');
      }
    });
    expect(lines, [
      for (var i = 0; i < 20; i++) ...['#$i', 'x', 'y'],
    ]);
  });

  test('colors and resets each line', () async {
    final lines = await capture(
      () => DevpulConsole.write('n', 'a\nb', color: ansiRed),
    );
    expect(
      lines,
      everyElement(allOf(startsWith(ansiRed), endsWith(ansiReset))),
    );
  });

  test('splits very long lines', () async {
    final lines = await capture(() => DevpulConsole.write('n', 'x' * 2500));
    expect(lines.length, 3);
    expect(lines.join(), 'n ${'x' * 2500}');
  });

  group('colors', () {
    tearDown(() {
      Devpul.ansiColorsByDefault = true;
      Devpul.configure(const DevpulConfig());
    });

    Future<String> errorLine() async =>
        (await capture(() => Devpul.error('x', null))).single;

    test('follow the default when the config leaves them unset', () async {
      Devpul.configure(const DevpulConfig(uiUrl: null));
      expect(await errorLine(), startsWith(ansiRed));
      Devpul.ansiColorsByDefault = false;
      expect(await errorLine(), 'error [app] String: x');
    });

    test('config overrides the default', () async {
      Devpul.ansiColorsByDefault = false;
      Devpul.configure(const DevpulConfig(uiUrl: null, ansiColors: true));
      expect(await errorLine(), startsWith(ansiRed));
    });
  });
}
