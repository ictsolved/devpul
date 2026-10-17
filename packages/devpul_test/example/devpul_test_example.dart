import 'package:devpul/devpul.dart';
import 'package:devpul_test/devpul_test.dart';
import 'package:test/test.dart';

// dart test example/devpul_test_example.dart
// The failing test writes build/devpul/example/devpul_test_example/...json.
void main() {
  DevpulTest.capture();

  test('adds an item to the cart', () {
    Devpul.log('Adding abc-1');
    Devpul.emit('cart.add', {'sku': 'abc-1', 'qty': 2});
    expect(cartSize(), 2);
  });
}

int cartSize() => 1;
