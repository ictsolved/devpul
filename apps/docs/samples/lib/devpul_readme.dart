import 'package:devpul/devpul.dart';

import 'stubs.dart';

void main() {
  Devpul.session({'name': 'My app', 'version': '1.0.0'}, tags: {'env': 'dev'});
  Devpul.emit('cart.updated', {'items': 3});
  Devpul.log('Signed in', name: 'auth');
  Devpul.action('Clear cache', (_) => cache.clear());
  try {
    sync();
  } catch (e, s) {
    Devpul.error(e, s, source: 'sync');
  }
}
