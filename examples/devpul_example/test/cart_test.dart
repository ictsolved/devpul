import 'package:devpul_example/main.dart';
import 'package:flutter_test/flutter_test.dart';

// A failing test here writes build/devpul/test/cart_test/<name>.json.
void main() {
  test('adds to the cart', () {
    container.read(cartProvider.notifier).add('abc-1');
    expect(container.read(cartProvider), ['abc-1']);
  });
}
