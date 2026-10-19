import 'dart:async';
import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:stream_channel/stream_channel.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

/// Sends WebSocket connections and their messages to DevPul for the
/// WebSocket tab.
abstract final class DevpulWebSocketChannel {
  /// Returns a channel over [channel] that sends its connection, the
  /// messages the app sends and receives, and its close to DevPul, under
  /// [url]. With Allow writes on, the tab sends text on it. Returns
  /// [channel] itself unless [Devpul.included].
  static WebSocketChannel wrap(WebSocketChannel channel, Uri url) {
    if (!Devpul.included) return channel;
    if (!_handling) {
      _handling = true;
      Devpul.handle(
        'web_socket_channel.connections',
        (_) => {
          'connections': [for (final c in _Channel._live.values) c._info()],
        },
        description: 'Open and connecting WebSockets with their URLs.',
      );
      Devpul.handle(
        'web_socket_channel.send',
        (args) {
          final id = args['id'];
          final channel = _Channel._live[id];
          if (channel == null) {
            throw _WebSocketError('No open WebSocket with id $id.');
          }
          if (!channel._open) {
            throw _WebSocketError('WebSocket $id is still connecting.');
          }
          final message = args['message'];
          if (message is! String) {
            throw const _WebSocketError('No message given.');
          }
          channel.sink._add(message, devpul: true);
          return null;
        },
        writes: true,
        description:
            'Sends a text message on an open WebSocket, as the app would; '
            'its send event carries devpul: true. Args: id (from '
            'web_socket_channel.connections), message.',
      );
    }
    return _Channel(channel, url);
  }

  static var _handling = false;
}

// Binary messages carry this many leading bytes.
const _maxBytes = 1024;

final class _Channel extends StreamChannelMixin<dynamic>
    implements WebSocketChannel {
  _Channel(this._inner, this._url) {
    _live[_id] = this;
    Devpul.emit('web_socket_channel.connect', {'id': _id, 'url': '$_url'});
    _inner.ready.then(
      (_) {
        _open = true;
        Devpul.emit('web_socket_channel.open', {
          'id': _id,
          'protocol': ?_protocol,
        });
      },
      // The stream gets the same error; a connection that never opened has
      // no close.
      onError: (Object error) {
        _closed = true;
        _live.remove(_id);
        Devpul.emit('web_socket_channel.error', {'id': _id, 'error': error});
      },
    );
  }

  static final _live = <String, _Channel>{};

  final WebSocketChannel _inner;
  final Uri _url;
  // Unique across isolates, which a counter is not.
  late final String _id = identityHashCode(this).toRadixString(36);
  var _open = false;
  var _closed = false;

  @override
  String? get protocol => _inner.protocol;

  // dart:io gives an empty string when the server picked none.
  String? get _protocol => switch (_inner.protocol) {
    '' => null,
    final protocol => protocol,
  };

  @override
  int? get closeCode => _inner.closeCode;

  @override
  String? get closeReason => _inner.closeReason;

  @override
  Future<void> get ready => _inner.ready;

  @override
  late final Stream<dynamic> stream = _inner.stream.transform(
    StreamTransformer.fromHandlers(
      handleData: (message, sink) {
        _message('receive', message);
        sink.add(message);
      },
      handleError: (error, stackTrace, sink) {
        if (_open) {
          Devpul.emit('web_socket_channel.error', {'id': _id, 'error': error});
        }
        sink.addError(error, stackTrace);
      },
      handleDone: (sink) {
        _close('peer', closeCode, closeReason);
        sink.close();
      },
    ),
  );

  @override
  late final _Sink sink = _Sink(this);

  void _message(String direction, Object? message, {bool devpul = false}) {
    final redact = Devpul.config.redactBody;
    final value = redact == null ? message : redact(_url, message);
    Devpul.emit('web_socket_channel.$direction', {
      'id': _id,
      if (value is List<int>) ...{
        'size': value.length,
        'bytes': base64Encode(
          value.length > _maxBytes ? value.sublist(0, _maxBytes) : value,
        ),
      } else
        'message': value,
      if (devpul) 'devpul': true,
    });
  }

  void _close(String by, int? code, String? reason) {
    if (_closed) return;
    _closed = true;
    _live.remove(_id);
    Devpul.emit('web_socket_channel.close', {
      'id': _id,
      'by': by,
      'code': ?code,
      'reason': ?reason,
    });
  }

  Map<String, Object?> _info() => {
    'id': _id,
    'url': '$_url',
    'state': _open ? 'open' : 'connecting',
    'protocol': ?_protocol,
  };
}

final class _Sink implements WebSocketSink {
  _Sink(this._channel);

  final _Channel _channel;

  WebSocketSink get _inner => _channel._inner.sink;

  @override
  void add(dynamic data) => _add(data);

  void _add(Object? data, {bool devpul = false}) {
    _channel._message('send', data, devpul: devpul);
    _inner.add(data);
  }

  @override
  void addError(Object error, [StackTrace? stackTrace]) =>
      _inner.addError(error, stackTrace);

  @override
  Future<dynamic> addStream(Stream<dynamic> stream) => _inner.addStream(
    stream.map((data) {
      _channel._message('send', data);
      return data;
    }),
  );

  @override
  Future<dynamic> close([int? closeCode, String? closeReason]) {
    _channel._close('app', closeCode, closeReason);
    return _inner.close(closeCode, closeReason);
  }

  @override
  Future<dynamic> get done => _inner.done;
}

final class _WebSocketError implements Exception {
  const _WebSocketError(this.message);

  final String message;

  @override
  String toString() => message;
}
