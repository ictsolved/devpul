import 'dart:io';

import 'package:devpul/devpul.dart';
import 'package:devpul_test/devpul_test.dart';
import 'package:test/test.dart';

// Run by capture_test.dart: one test passes, two fail, one is skipped.
void main() {
  Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
  DevpulTest.capture(directory: Platform.environment['DEVPUL_OUT']!);
  setUpAll(() => Devpul.session({'name': 'Shop', 'version': '2.3.1'}));

  test('loads the catalog', () => Devpul.log('3 products'));

  group('cart', () {
    test('adds an item', () {
      Devpul.log('Adding abc-1', level: 'debug', name: 'cart');
      Devpul.emit('cart.add', {'sku': 'abc-1', 'qty': 2});
      expect(2, 1);
    });

    test('checks out', () {}, skip: 'no payments here');

    test('pays', () => throw StateError('declined'));
  });
}
