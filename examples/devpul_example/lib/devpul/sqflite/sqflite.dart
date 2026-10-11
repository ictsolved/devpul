import 'dart:convert';
import 'dart:typed_data';

import 'package:devpul/devpul.dart';
import 'package:sqflite_common/sqlite_api.dart';

const _maxRows = 500;
const _maxBytes = 1 << 20;
const _maxText = 64 * 1024;
const _blobHead = 32;
// Larger integers lose digits as JS numbers.
const _maxSafe = 9007199254740991;

/// Serves the app's sqflite databases to the SQLite tab.
abstract final class DevpulSqflite {
  static final _databases = <String, Database>{};

  /// Shows [db] in the SQLite tab as [name], by default its file name; the
  /// same name replaces the one before. The tab reads through this
  /// connection and, with Allow writes on, runs any statement on it. Does
  /// nothing unless [Devpul.included].
  static void add(Database db, {String? name}) {
    if (!Devpul.included) return;
    _databases[name ?? db.path.split(RegExp(r'[/\\]')).last] = db;
    Devpul.handle('sqflite.databases', (_) {
      _databases.removeWhere((_, db) => !db.isOpen);
      return {
        'databases': [
          for (final MapEntry(:key, :value) in _databases.entries)
            {'name': key, 'path': value.path},
        ],
      };
    });
    Devpul.handle('sqflite.query', (args) async {
      final (db, sql, statement) = _target(args);
      await _checkRead(db, sql, statement);
      return _rows(db, sql);
    });
    Devpul.handle('sqflite.execute', (args) async {
      final (db, sql, statement) = _target(args);
      if (statement.first.text == 'EXPLAIN' ||
          (await db.rawQuery(
            'EXPLAIN $sql',
          )).any((op) => op['opcode'] == 'ResultRow')) {
        return _rows(db, sql);
      }
      final before = await _totalChanges(db);
      await db.execute(sql);
      return {'changes': await _totalChanges(db) - before};
    }, writes: true);
  }
}

(Database, String, List<_Token>) _target(Map<String, Object?> args) {
  final name = args['db'];
  final db = DevpulSqflite._databases[name];
  if (db == null || !db.isOpen) {
    throw _SqlError('No open database named $name.');
  }
  final sql = args['sql'];
  if (sql is! String) throw const _SqlError('No sql given.');
  return (db, sql, _statement(sql));
}

Future<int> _totalChanges(Database db) async =>
    (await db.rawQuery('SELECT total_changes() AS n')).first['n']! as int;

typedef _Token = ({String text, int start});

const _transaction = {
  'BEGIN',
  'COMMIT',
  'END',
  'ROLLBACK',
  'SAVEPOINT',
  'RELEASE',
};

// Opcodes that make sqlite3_stmt_readonly false, plus the table writes.
const _writeOps = {
  'OpenWrite',
  'VUpdate',
  'Vacuum',
  'JournalMode',
  'Checkpoint',
};

/// The tokens of the one statement in [sql].
List<_Token> _statement(String sql) {
  final tokens = _tokens(sql);
  final end = tokens.indexWhere((t) => t.text == ';');
  if (end != -1 && tokens.skip(end).any((t) => t.text != ';')) {
    throw const _SqlError('Run one statement at a time.');
  }
  final statement = end == -1 ? tokens : tokens.sublist(0, end);
  if (statement.isEmpty) throw const _SqlError('No sql given.');
  if (_transaction.contains(statement.first.text)) {
    throw const _SqlError(
      "Transactions would hold the app's connection; each statement "
      'commits on its own.',
    );
  }
  return statement;
}

Future<void> _checkRead(Database db, String sql, List<_Token> statement) async {
  var at = 0;
  if (statement.first.text == 'EXPLAIN') {
    at = statement.length > 2 && statement[1].text == 'QUERY' ? 3 : 1;
  }
  final keyword = at < statement.length ? statement[at] : null;
  switch (keyword?.text) {
    case 'SELECT' || 'WITH' || 'VALUES':
      break;
    case 'PRAGMA':
      throw const _SqlError(
        'PRAGMA can change the connection; turn on Allow writes in the '
        "Plugins tab to run it, or read with SELECT * FROM pragma_table_info('t').",
      );
    default:
      throw _SqlError(
        'With writes off only SELECT, WITH and VALUES run; turn on Allow '
        'writes in the Plugins tab to run ${keyword?.text ?? 'this'}.',
      );
  }
  // WITH and SELECT can still write: WITH x AS (...) DELETE ...
  final program = await db.rawQuery('EXPLAIN ${sql.substring(keyword!.start)}');
  final writes = program.any((op) {
    final code = op['opcode'];
    return _writeOps.contains(code) || code == 'Transaction' && op['p2'] != 0;
  });
  if (writes) {
    throw const _SqlError(
      'This statement writes; turn on Allow writes in the Plugins tab to '
      'run it.',
    );
  }
}

/// Words upper-cased, quoted strings and names as one token each, other
/// characters one by one. Whitespace and comments are skipped.
List<_Token> _tokens(String sql) {
  final out = <_Token>[];
  var i = 0;
  int until(String close, int from) {
    final end = sql.indexOf(close, from);
    return end == -1 ? sql.length : end + close.length;
  }

  while (i < sql.length) {
    final start = i;
    final c = sql[i];
    if (c.trim().isEmpty) {
      i++;
    } else if (sql.startsWith('--', i)) {
      i = until('\n', i);
    } else if (sql.startsWith('/*', i)) {
      i = until('*/', i + 2);
    } else if (c == "'" || c == '"' || c == '`' || c == '[') {
      final close = c == '[' ? ']' : c;
      i = start + 1;
      // A doubled quote stays inside.
      while (true) {
        i = until(close, i);
        if (close == ']' || !sql.startsWith(close, i)) break;
        i += 1;
      }
      out.add((text: c, start: start));
    } else if (RegExp(r'[\w$]').hasMatch(c)) {
      while (i < sql.length && RegExp(r'[\w$]').hasMatch(sql[i])) {
        i++;
      }
      out.add((text: sql.substring(start, i).toUpperCase(), start: start));
    } else {
      out.add((text: c, start: start));
      i++;
    }
  }
  return out;
}

Future<Map<String, Object?>> _rows(Database db, String sql) async {
  final columns = <String>[];
  final rows = <List<Object?>>[];
  var size = 0;
  var more = false;
  final cursor = await db.rawQueryCursor(sql, null);
  try {
    while (await cursor.moveNext()) {
      if (rows.length == _maxRows || size > _maxBytes) {
        more = true;
        break;
      }
      final row = cursor.current;
      if (columns.isEmpty) columns.addAll(row.keys);
      final values = [for (final v in row.values) _cell(v)];
      size += jsonEncode(values).length;
      rows.add(values);
    }
  } finally {
    await cursor.close();
  }
  return {'columns': columns, 'rows': rows, 'more': more};
}

Object? _cell(Object? value) => switch (value) {
  Uint8List() => {
    'blob': value.length,
    'head': [
      for (final b in value.take(_blobHead))
        b.toRadixString(16).padLeft(2, '0'),
    ].join(' '),
  },
  String() when value.length > _maxText => {
    'text': value.substring(0, _maxText),
    'length': value.length,
  },
  int() when value > _maxSafe || value < -_maxSafe => {'int': '$value'},
  double() when !value.isFinite => {'real': '$value'},
  _ => value,
};

final class _SqlError implements Exception {
  const _SqlError(this.message);

  final String message;

  @override
  String toString() => message;
}
