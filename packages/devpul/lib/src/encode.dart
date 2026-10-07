import 'dart:convert';

const truncatedKey = 'devpul.truncated';
const _maxDepth = 64;

/// Converts [value] into something `jsonEncode` accepts. Unknown objects
/// become their `toString()`.
Object? toJsonSafe(Object? value) => _Walk().safe(value, 0);

/// Returns [value] converted by [toJsonSafe] with its encoded length, or a
/// truncation marker when the encoded form is longer than [max]. Measures
/// without encoding; only a truncated value is encoded, up to [max].
(Object?, int) capValue(Object? value, int max) {
  final walk = _Walk();
  final safe = walk.safe(value, 0);
  if (walk.size <= max) return (safe, walk.size);
  final marker = {
    truncatedKey: {'size': walk.size, 'preview': _preview(safe, max)},
  };
  return (marker, max + 64);
}

final class _Walk {
  int size = 0;

  Object? safe(Object? value, int depth) {
    if (value == null) {
      size += 4;
      return null;
    }
    if (value is bool) {
      size += value ? 4 : 5;
      return value;
    }
    if (value is String) {
      size += _stringSize(value);
      return value;
    }
    if (value is num) {
      if (!value.isFinite) return _text(value.toString());
      size += value.toString().length;
      return value;
    }
    if (depth >= _maxDepth) return _text('<nested too deep>');
    if (value is Map) {
      size += value.isEmpty ? 2 : 1 + value.length * 2;
      return {
        for (final e in value.entries)
          _text(_string(e.key as Object?)): safe(e.value as Object?, depth + 1),
      };
    }
    if (value is Iterable) {
      final list = [for (final v in value) safe(v as Object?, depth + 1)];
      size += list.isEmpty ? 2 : 1 + list.length;
      return list;
    }
    if (value is DateTime) return _text(value.toIso8601String());
    if (value is Uri) return _text(value.toString());
    return _text(_string(value));
  }

  String _text(String s) {
    size += _stringSize(s);
    return s;
  }
}

String _string(Object? value) {
  try {
    return value.toString();
  } catch (_) {
    return '<${value.runtimeType}>';
  }
}

/// Length of `jsonEncode(s)`.
int _stringSize(String s) {
  var size = s.length + 2;
  for (var i = 0; i < s.length; i++) {
    final c = s.codeUnitAt(i);
    if (c >= 0x20 && c != 0x22 && c != 0x5c && (c & 0xf800) != 0xd800) {
      continue;
    }
    if (c == 0x22 || c == 0x5c || (c >= 0x08 && c <= 0x0d && c != 0x0b)) {
      // \" \\ \b \t \n \f \r
      size += 1;
    } else if (c < 0x20) {
      size += 5;
    } else if (c < 0xdc00 &&
        i + 1 < s.length &&
        (s.codeUnitAt(i + 1) & 0xfc00) == 0xdc00) {
      i++;
    } else {
      // Unpaired surrogate.
      size += 5;
    }
  }
  return size;
}

String _preview(Object? value, int max) {
  if (value is String) {
    return value.length <= max ? value : value.substring(0, max);
  }
  final out = _Capped(max);
  try {
    const JsonEncoder().startChunkedConversion(out)
      ..add(value)
      ..close();
  } on _Full {
    // Enough for the preview.
  }
  return out.text;
}

final class _Full implements Exception {}

/// Collects up to [max] characters, then stops the encoder.
final class _Capped implements Sink<String> {
  _Capped(this.max);

  final int max;
  final _buffer = StringBuffer();

  String get text => _buffer.toString();

  @override
  void add(String data) {
    final room = max - _buffer.length;
    if (data.length >= room) {
      _buffer.write(data.substring(0, room));
      throw _Full();
    }
    _buffer.write(data);
  }

  @override
  void close() {}
}
