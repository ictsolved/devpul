import 'dart:convert';
import 'dart:math';

const truncatedKey = 'devpul.truncated';
const _maxDepth = 64;

/// Converts [value] into something `jsonEncode` accepts. Unknown objects
/// become their `toString()`.
Object? toJsonSafe(Object? value) => _safe(value, 0);

Object? _safe(Object? value, int depth) {
  if (value == null || value is bool || value is String) return value;
  if (value is num) return value.isFinite ? value : value.toString();
  if (depth >= _maxDepth) return '<nested too deep>';
  if (value is Map) {
    return {
      for (final e in value.entries)
        e.key.toString(): _safe(e.value as Object?, depth + 1),
    };
  }
  if (value is Iterable) {
    return [for (final v in value) _safe(v as Object?, depth + 1)];
  }
  if (value is DateTime) return value.toIso8601String();
  if (value is Uri) return value.toString();
  return _string(value);
}

String _string(Object value) {
  try {
    return value.toString();
  } catch (_) {
    return '<${value.runtimeType}>';
  }
}

/// Returns [value] (already JSON safe) and its encoded length, or a
/// truncation marker when the encoded form is longer than [max].
(Object?, int) capValue(Object? value, int max) {
  final encoded = jsonEncode(value);
  if (encoded.length <= max) return (value, encoded.length);
  final text = value is String ? value : encoded;
  final marker = {
    truncatedKey: {
      'size': encoded.length,
      'preview': text.substring(0, min(max, text.length))
    },
  };
  return (marker, max + 64);
}
