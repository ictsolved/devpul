import 'package:devpul/devpul.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:logging/logging.dart';

import 'stubs.dart';

void session() {
  Devpul.session(
    {
      'name': 'Shop',
      'version': '2.3.1',
      'env': 'staging',
      'baseUrl': 'https://api.example.com',
    },
    tags: {'env': 'staging'},
  );
}

void tags() {
  Devpul.tags['user'] = 'guest';
}

void emit() {
  Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
}

Future<void> checkout() =>
    DevpulCause('cart.checkout', {'items': cart.items.length}).run(placeOrder);

void logs(Object e, StackTrace s) {
  Devpul.log('Signed in', name: 'auth');
  Devpul.log('Retrying', level: 'warn', name: 'sync');
  Devpul.log('Sync failed', level: 'error', name: 'sync', error: e, stack: s);
}

void lazyLog() {
  Devpul.log(() => 'Cart: ${cart.items}', name: 'cart');
}

void logging() {
  Logger.root.onRecord.listen(
    (r) => Devpul.log(
      r.message,
      level: r.level.name.toLowerCase(),
      name: r.loggerName,
      error: r.error,
      stack: r.stackTrace,
    ),
  );
}

Future<void> errors() async {
  try {
    await sync();
  } catch (e, s) {
    Devpul.error(e, s, source: 'sync');
  }
}

void actions() {
  Devpul.action('Clear cache', (_) => cache.clear());
}

void handlers() {
  Devpul.handle(
    'cart.items',
    (_) => cart.items,
    description: 'Items in the cart.',
  );
  Devpul.handle(
    'cart.remove',
    (args) => cart.remove(args['sku']! as String),
    writes: true,
    description: 'Removes an item. Args: sku.',
  );
}

void limits() {
  Devpul.limit('frame', 0); // mute
  Devpul.limit('route', 20); // at most 20 per second
  Devpul.limit('route', null); // no cap
}

void configure() {
  Devpul.configure(
    DevpulConfig(
      console: ConsoleMode.verbose,
      ignoreUrls: [RegExp(r'/health$'), 'analytics.example.com'],
      ignoreMethods: {'OPTIONS'},
    ),
  );
}

void included() {
  if (Devpul.included) Bloc.observer = MyObserver();
}

void redaction() {
  Devpul.configure(
    DevpulConfig(
      redactHeaders: (url, headers) => {
        for (final e in headers.entries)
          e.key: e.key.toLowerCase() == 'authorization' ? '***' : e.value,
      },
      redactBody: (url, body) =>
          url.path.endsWith('/login') ? '<hidden>' : body,
    ),
  );
}
