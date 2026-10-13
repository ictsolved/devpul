import 'dart:async';
import 'dart:developer' as developer;
import 'dart:isolate';

import 'package:devpul/devpul.dart';

// Run by mcp_vm_test.dart under a VM service.
void main() {
  Devpul.configure(const DevpulConfig(ansiColors: false));
  Devpul.session({'name': 'shop', 'version': '2.0.0'});
  Devpul.route = () => '/cart';
  var items = 0;
  Devpul.action(
    'add items',
    (args) => items += (args['count']! as num).toInt(),
    params: const [DevpulParam.number('count', initial: 1)],
  );
  final cart = <String>['sku-1'];
  Devpul.plugin('cart', () => 'export default {}', description: 'The cart.');
  Devpul.handle('cart.items', (_) => cart, description: 'Skus in the cart.');
  Devpul.handle('cart.clear', (_) => cart.clear(), writes: true);
  Devpul.handle('cart.token', (_) => 'secret', sensitive: true);
  Devpul.handle('flags.list', (_) => {'beta': true});
  Devpul.emit('route', {'action': 'push', 'route': '/cart'});
  Devpul.log('cart opened');
  developer.log('order ${'x' * 300}', name: 'orders', level: 1000);
  DevpulHttp.request(
    method: 'post',
    url: Uri.parse('https://api.example.com/cart?id=1'),
    body: {'sku': 'abc-1'},
  )?.response(status: 201, body: {'items': List.filled(400, 'sku-1')});
  DevpulHttp.request(
    method: 'get',
    url: Uri.parse('https://cdn.example.com/banner.png'),
  )?.error(errorType: 'connectionError', message: 'refused');
  Devpul.emit('cart.updated', {'items': 1});
  // After the info event, which goes out in a microtask.
  scheduleMicrotask(
    () => Devpul.error(StateError('cart is empty'), StackTrace.current),
  );
  ReceivePort();
}
