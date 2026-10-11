import 'package:devpul/devpul.dart';

import 'stubs.dart';

void events() {
  Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
}

void handlers() {
  Devpul.handle('flags.list', (_) => flags.toJson());
  Devpul.handle('flags.set', (args) {
    flags.set(args['name']! as String, on: args['on']! as bool);
    return flags.toJson();
  }, writes: true);
}

const _plugin = r'''
export default { api: 1, id: 'cart', label: 'Cart', kinds: ['cart.updated'] };
''';

void installCartTab() => Devpul.plugin(
  'cart',
  () => _plugin,
  version: '1.0.0',
  origin: 'my_cart',
  description: 'Cart contents and totals.',
);
