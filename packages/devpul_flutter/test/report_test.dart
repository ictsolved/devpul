import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugRunCall;
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  setUpAll(() {
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    DevpulFlutter.install();
  });

  testWidgets('takes a screenshot in physical pixels', (tester) async {
    tester.view.physicalSize = const Size(300, 600);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      const ColoredBox(color: Color(0xff0000ff), child: SizedBox.expand()),
    );

    final shot =
        (await tester.runAsync(() => debugRunCall('flutter.screenshot')))!
            as Map<String, Object?>;

    expect(shot['width'], 300);
    expect(shot['height'], 600);
    final image = shot['image']! as String;
    expect(image, startsWith('data:image/png;base64,'));
    final png = base64Decode(image.substring(image.indexOf(',') + 1));
    expect(png.sublist(1, 4), utf8.encode('PNG'));
  });

  testWidgets('describes the device', (tester) async {
    tester.view.physicalSize = const Size(300, 600);
    tester.view.devicePixelRatio = 2;
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.view.reset);
    addTearDown(tester.platformDispatcher.clearAllTestValues);

    final device = await debugRunCall('flutter.device') as Map<String, Object?>;

    expect(device, containsPair('platform', 'android'));
    expect(device, containsPair('mode', 'debug'));
    expect(device, containsPair('locale', 'en-US'));
    expect(device, containsPair('width', 150));
    expect(device, containsPair('height', 300));
    expect(device, containsPair('pixelRatio', 2));
    expect(device, containsPair('textScale', 1.5));
    expect(device, containsPair('brightness', 'light'));
    expect(device['os'], isA<String>());
    expect(device['accessibility'], isEmpty);
  });
}
