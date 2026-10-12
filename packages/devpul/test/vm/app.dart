import 'dart:async';
import 'dart:developer' as developer;
import 'dart:isolate';

import 'package:devpul/devpul.dart';

// Run by vm_service_test.dart under a VM service, paused on start.
void main() {
  Devpul.configure(
    const DevpulConfig(ansiColors: false, uiUrl: 'https://ui.example.com/'),
  );
  Devpul.session({'name': 'e2e'}, tags: {'flavor': 'test'});
  Devpul.action(
    'echo',
    (args) => args['text'],
    params: const [DevpulParam.text('text', initial: 'pong')],
  );
  Devpul.plugin('e2e', () => 'export default {}');
  final cart = <String, Object?>{};
  Devpul.handle('cart.set', (args) => cart..addAll(args), writes: true);
  Devpul.log('hello', level: 'warn');
  developer.log(
    'token refresh failed',
    name: 'auth',
    level: 900,
    error: StateError('expired'),
    stackTrace: StackTrace.fromString(
      '#0      main (file:///app/main.dart:5:3)',
    ),
  );
  developer.log('{"items": [${List.filled(40, '"sku-1"').join(', ')}]}');
  DevpulHttp.request(
    method: 'get',
    url: Uri.parse('https://example.com/items'),
  )?.response(status: 200, body: {'ok': true});
  // After the info event, which goes out in a microtask.
  scheduleMicrotask(() => Devpul.error(StateError('boom'), StackTrace.current));
  // Stay alive for service extension calls; the test kills the process.
  ReceivePort();
}
