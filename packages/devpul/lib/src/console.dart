import 'dart:async';
import 'dart:collection';

const ansiReset = '\x1B[0m';
const ansiRed = '\x1B[31m';
const ansiGreen = '\x1B[32m';
const ansiYellow = '\x1B[33m';
const ansiCyan = '\x1B[36m';
const ansiGrey = '\x1B[90m';

// Android logcat cuts lines at about 4 KB.
const _maxLine = 1000;

/// One queue, one draining loop: lines never interleave and bursts stay under
/// logcat rate limits. `debugPrint` cuts long output; `log` is IDE only.
abstract final class DevpulConsole {
  static final _lines = Queue<String>();
  static bool _draining = false;

  static void write(String name, String content, {String? color}) {
    final lines = content.contains('\n')
        ? [name, ...content.split('\n')]
        : ['$name $content'];
    for (final line in lines) {
      for (var i = 0; i < line.length || i == 0; i += _maxLine) {
        final end = i + _maxLine < line.length ? i + _maxLine : line.length;
        final part = line.substring(i, end);
        _lines.add(color == null ? part : '$color$part$ansiReset');
      }
    }
    if (!_draining) unawaited(_drain());
  }

  static Future<void> _drain() async {
    _draining = true;
    try {
      while (_lines.isNotEmpty) {
        // ignore: avoid_print
        print(_lines.removeFirst());
        if (_lines.isNotEmpty) {
          await Future<void>.delayed(const Duration(milliseconds: 2));
        }
      }
    } finally {
      _draining = false;
    }
  }
}
