import 'package:devpul_test/devpul_test.dart';
import 'package:test/test.dart';

import 'stubs.dart';

void main() {
  DevpulTest.capture();

  test('places an order', () async {
    await placeOrder();
    expect(cart.items, isEmpty);
  });
}

void folder() {
  DevpulTest.capture(directory: 'build/test-sessions');
}
