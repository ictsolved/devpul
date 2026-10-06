import 'dart:async';

import 'package:devpul/src/console.dart';
import 'package:test/test.dart';

Future<List<String>> capture(void Function() body) async {
  final lines = <String>[];
  await runZoned(
    () async {
      body();
      await Future<void>.delayed(const Duration(milliseconds: 200));
    },
    zoneSpecification: ZoneSpecification(
      print: (_, __, ___, line) => lines.add(line),
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
        lines, everyElement(allOf(startsWith(ansiRed), endsWith(ansiReset))));
  });

  test('splits very long lines', () async {
    final lines = await capture(() => DevpulConsole.write('n', 'x' * 2500));
    expect(lines.length, 3);
    expect(lines.join(), 'n ${'x' * 2500}');
  });
}
