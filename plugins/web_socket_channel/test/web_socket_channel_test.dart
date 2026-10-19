import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:devpul/devpul.dart';
// ignore: implementation_imports
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunCall;
import 'package:test/test.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import '../web_socket_channel.dart';

void main() {
  late HttpServer server;
  late Uri url;
  final events = <(String, Map<String, Object?>)>[];

  setUpAll(() async {
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    url = Uri.parse('ws://127.0.0.1:${server.port}');
    server.transform(WebSocketTransformer()).listen((socket) {
      socket.listen((message) {
        if (message == 'bye') {
          socket.close(4000, 'done');
        } else {
          socket.add(message);
        }
      });
    });
  });

  tearDownAll(() => server.close(force: true));

  setUp(() {
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    events.clear();
    debugOnPost = (kind, event) {
      if (kind.startsWith('web_socket_channel.')) {
        events.add((kind, event['data']! as Map<String, Object?>));
      }
    };
  });

  List<String> kinds() => [for (final e in events) e.$1];
  List<Object?> all() => [
    for (final e in events) [e.$1, e.$2],
  ];

  test('sends the connection, messages both ways and its close', () async {
    final channel = DevpulWebSocketChannel.wrap(
      WebSocketChannel.connect(url),
      url,
    );
    await channel.ready;
    final received = channel.stream.first;
    channel.sink.add('{"hi":1}');
    expect(await received, '{"hi":1}');
    await channel.sink.close(1000, 'leaving');
    final id = events.first.$2['id'];
    expect(all(), [
      [
        'web_socket_channel.connect',
        {'id': id, 'url': '$url'},
      ],
      [
        'web_socket_channel.open',
        {'id': id},
      ],
      [
        'web_socket_channel.send',
        {'id': id, 'message': '{"hi":1}'},
      ],
      [
        'web_socket_channel.receive',
        {'id': id, 'message': '{"hi":1}'},
      ],
      [
        'web_socket_channel.close',
        {'id': id, 'by': 'app', 'code': 1000, 'reason': 'leaving'},
      ],
    ]);
  });

  test('sends binary messages as their size and first bytes', () async {
    final channel = DevpulWebSocketChannel.wrap(
      WebSocketChannel.connect(url),
      url,
    );
    final bytes = List.generate(2000, (i) => i % 256);
    final received = channel.stream.first;
    channel.sink.add(bytes);
    expect(await received, bytes);
    await channel.sink.close();
    final send = events.firstWhere((e) => e.$1 == 'web_socket_channel.send');
    expect(send.$2['size'], 2000);
    expect(base64Decode(send.$2['bytes']! as String), bytes.sublist(0, 1024));
    expect(send.$2.containsKey('message'), false);
  });

  test('a close by the peer carries its code and reason', () async {
    final channel = DevpulWebSocketChannel.wrap(
      WebSocketChannel.connect(url),
      url,
    );
    channel.sink.add('bye');
    await channel.stream.drain<void>();
    expect(all().last, [
      'web_socket_channel.close',
      {
        'id': events.first.$2['id'],
        'by': 'peer',
        'code': 4000,
        'reason': 'done',
      },
    ]);
    expect(channel.closeCode, 4000);
  });

  test('a failed connection sends its error', () async {
    final closed = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    final port = closed.port;
    await closed.close();
    final to = Uri.parse('ws://127.0.0.1:$port');
    final channel = DevpulWebSocketChannel.wrap(
      WebSocketChannel.connect(to),
      to,
    );
    await expectLater(channel.ready, throwsA(isA<WebSocketChannelException>()));
    await expectLater(
      channel.stream.drain<void>(),
      throwsA(isA<WebSocketChannelException>()),
    );
    expect(kinds(), ['web_socket_channel.connect', 'web_socket_channel.error']);
    expect(await debugRunCall('web_socket_channel.connections'), {
      'connections': <Object?>[],
    });
  });

  test('redactBody applies to messages', () async {
    Devpul.configure(
      DevpulConfig(
        console: ConsoleMode.off,
        redactBody: (url, body) => body is String ? '<redacted>' : body,
      ),
    );
    final channel = DevpulWebSocketChannel.wrap(
      WebSocketChannel.connect(url),
      url,
    );
    final received = channel.stream.first;
    channel.sink.add('token=secret');
    expect(await received, 'token=secret');
    await channel.sink.close();
    expect(
      [
        for (final e in events)
          if (e.$2.containsKey('message')) e.$2['message'],
      ],
      ['<redacted>', '<redacted>'],
    );
  });

  test('lists live connections', () async {
    final channel = DevpulWebSocketChannel.wrap(
      WebSocketChannel.connect(url),
      url,
    );
    await channel.ready;
    final id = events.first.$2['id'];
    expect(await debugRunCall('web_socket_channel.connections'), {
      'connections': [
        {'id': id, 'url': '$url', 'state': 'open'},
      ],
    });
    await channel.sink.close();
    expect(await debugRunCall('web_socket_channel.connections'), {
      'connections': <Object?>[],
    });
  });

  test('messages added from a stream are sent', () async {
    final channel = DevpulWebSocketChannel.wrap(
      WebSocketChannel.connect(url),
      url,
    );
    final received = channel.stream.take(2).toList();
    await channel.sink.addStream(Stream.fromIterable(['a', 'b']));
    expect(await received, ['a', 'b']);
    await channel.sink.close();
    expect(kinds().where((k) => k == 'web_socket_channel.send'), hasLength(2));
  });
}
