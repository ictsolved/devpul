import 'dart:async';
import 'dart:isolate';

import 'package:devpul/devpul.dart';

// Run by vm_service_test.dart under a VM service, paused on start.
void main() {
  Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
  Devpul.session({'name': 'e2e'}, tags: {'flavor': 'test'});
  Devpul.action(
    'echo',
    (args) => args['text'],
    params: const [DevpulParam.text('text', initial: 'pong')],
  );
  Devpul.plugin('e2e', () => 'export default {}');
  Devpul.log('hello', level: 'warn');
  DevpulHttp.request(
    method: 'get',
    url: Uri.parse('https://example.com/items'),
  )?.response(status: 200, body: {'ok': true});
  // After the info event, which goes out in a microtask.
  scheduleMicrotask(() => Devpul.error(StateError('boom'), StackTrace.current));
  // Stay alive for service extension calls; the test kills the process.
  ReceivePort();
}
