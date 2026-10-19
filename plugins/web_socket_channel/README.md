# web_socket_channel

A WebSocket tab for DevPul: each channel the app wraps, with its URL, state, protocol and close code and reason, and the messages it sends and receives, newest first. Click a message for its JSON tree or text, or a hex dump of a binary one. Each connect, open, message, error and close is also an event (`web_socket_channel.*`).

```sh
devpul add web_socket_channel
```

```dart
import 'package:web_socket_channel/web_socket_channel.dart';

import 'devpul/plugins.dart';

final url = Uri.parse('wss://example.com/socket');
final channel = DevpulWebSocketChannel.wrap(
  WebSocketChannel.connect(url),
  url,
);
```

`wrap` takes any `WebSocketChannel`, such as an `IOWebSocketChannel` with headers, and the URL to show for it. It returns the channel unchanged unless `Devpul.included`.

Received messages are the ones the app's listener gets, so wrap before listening. Binary messages carry their size and first 1 KB. `redactBody` from `DevpulConfig` runs on every message with the URL, and `maxValueLength` cuts long ones. A busy socket can be capped with `Devpul.limit('web_socket_channel.receive', 20)`.

The wrapper handles errors from `ready` to show a failed connection in the tab, so in debug builds an app that ignores `ready` gets no uncaught error from it. The stream still gets the error.

Needs `web_socket_channel` 3.
