import 'dart:isolate';

import 'package:devpul/devpul.dart';

// Run by vm_service_test.dart under a VM service, paused on start.
void main() {
  Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
  Devpul.session({'name': 'e2e'}, tags: {'flavor': 'test'});
  Devpul.action('ping', () => 'pong');
  Devpul.log('hello', level: 'warn');
  DevpulHttp.request(
    method: 'get',
    url: Uri.parse('https://example.com/items'),
  )?.response(status: 200, body: {'ok': true});
  Devpul.error(StateError('boom'), StackTrace.current);
  // Stay alive for backlog and action calls; the test kills the process.
  ReceivePort();
}
