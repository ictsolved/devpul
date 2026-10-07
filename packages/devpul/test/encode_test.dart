import 'dart:convert';

import 'package:devpul/src/encode.dart';
import 'package:test/test.dart';

class _Thing {
  @override
  String toString() => 'thing';
}

class _Broken {
  @override
  String toString() => throw StateError('no');
}

void main() {
  group('toJsonSafe', () {
    test('keeps JSON values', () {
      final value = {
        'a': 1,
        'b': [true, null, 'x', 2.5],
      };
      expect(toJsonSafe(value), value);
    });

    test('converts keys and unknown values to strings', () {
      final out = toJsonSafe({
        1: _Thing(),
        'when': DateTime.utc(2026, 1, 2),
        'uri': Uri.parse('https://example.com/a'),
        'set': {1, 2},
        'nan': double.nan,
        'broken': _Broken(),
      });
      expect(out, {
        '1': 'thing',
        'when': '2026-01-02T00:00:00.000Z',
        'uri': 'https://example.com/a',
        'set': [1, 2],
        'nan': 'NaN',
        'broken': '<_Broken>',
      });
      expect(() => jsonEncode(out), returnsNormally);
    });

    test('stops at deep nesting', () {
      Object? value = 'leaf';
      for (var i = 0; i < 100; i++) {
        value = [value];
      }
      expect(() => jsonEncode(toJsonSafe(value)), returnsNormally);
      expect(jsonEncode(toJsonSafe(value)), contains('<nested too deep>'));
    });
  });

  group('capValue', () {
    test('measures the encoded length without encoding', () {
      final values = <Object?>[
        null,
        true,
        false,
        0,
        -12.5,
        1e21,
        double.infinity,
        '',
        'plain',
        'quote " backslash \\ tab \t newline \n bell \x07 nul \x00',
        'emoji \u{1F600} accents \u00e9',
        'lone \ud800 and \udc00 surrogates',
        <Object?>[],
        <String, Object?>{},
        {
          'a': [1, 'b', null, <String, Object?>{}],
          2: {'c': DateTime.utc(2026), 'd': _Thing()},
        },
      ];
      for (final v in values) {
        final (safe, size) = capValue(v, 1 << 20);
        expect(size, jsonEncode(safe).length, reason: '$v');
      }
    });

    test('passes short values', () {
      final (value, size) = capValue({'a': 'b'}, 100);
      expect(value, {'a': 'b'});
      expect(size, jsonEncode({'a': 'b'}).length);
    });

    test('replaces long values with a marker', () {
      final (value, _) = capValue({'a': 'x' * 50}, 20);
      final marker = (value! as Map)[truncatedKey] as Map;
      expect(marker['size'], jsonEncode({'a': 'x' * 50}).length);
      expect((marker['preview'] as String).length, 20);
    });

    test('previews strings without JSON quoting', () {
      final (value, _) = capValue('y' * 30, 10);
      final marker = (value! as Map)[truncatedKey] as Map;
      expect(marker['preview'], 'y' * 10);
    });

    test('previews a long structure without encoding all of it', () {
      final big = [for (var i = 0; i < 100000; i++) i];
      final (value, _) = capValue(big, 12);
      final marker = (value! as Map)[truncatedKey] as Map;
      expect(marker['preview'], '[0,1,2,3,4,5');
      expect(marker['size'], jsonEncode(big).length);
    });

    test('handles strings whose escaping pushes them over the cap', () {
      final (value, _) = capValue('"' * 8, 10);
      final marker = (value! as Map)[truncatedKey] as Map;
      expect(marker['preview'], '"' * 8);
    });
  });
}
