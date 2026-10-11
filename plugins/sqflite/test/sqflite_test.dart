// ignore: implementation_imports
import 'package:devpul/src/devpul.dart' show debugRunCall;
import 'package:sqflite_common_ffi/sqflite_ffi.dart';
import 'package:test/test.dart';

import '../sqflite.dart';

void main() {
  late Database db;

  setUpAll(sqfliteFfiInit);

  setUp(() async {
    db = await databaseFactoryFfi.openDatabase(inMemoryDatabasePath);
    await db.execute('CREATE TABLE item (id INTEGER PRIMARY KEY, name TEXT)');
    await db.execute("INSERT INTO item (name) VALUES ('a'), ('b'), ('c')");
    DevpulSqflite.add(db, name: 'app');
  });

  tearDown(() => db.close());

  Future<Object?> query(String sql) =>
      debugRunCall('sqflite.query', {'db': 'app', 'sql': sql});
  Future<Object?> execute(String sql) =>
      debugRunCall('sqflite.execute', {'db': 'app', 'sql': sql}, true);
  Future<int> count() async =>
      (await db.rawQuery('SELECT count(*) AS n FROM item')).first['n']! as int;

  test('lists open databases', () async {
    expect(await debugRunCall('sqflite.databases'), {
      'databases': [
        {'name': 'app', 'path': inMemoryDatabasePath},
      ],
    });
  });

  test('reads rows with their columns', () async {
    expect(
      await query(
        "SELECT id, name FROM item WHERE name > 'a' OR name = 'a; b' -- ;\nORDER BY id",
      ),
      {
        'columns': ['id', 'name'],
        'rows': [
          [2, 'b'],
          [3, 'c'],
        ],
        'more': false,
      },
    );
    expect(
      await query('VALUES (1);;'),
      containsPair('rows', [
        [1],
      ]),
    );
    expect(
      await query('WITH x AS (SELECT 1 AS n) SELECT n FROM x'),
      containsPair('rows', [
        [1],
      ]),
    );
    expect(await query('EXPLAIN QUERY PLAN SELECT * FROM item'), isNotNull);
  });

  test('refuses statements that write without writes', () async {
    for (final sql in [
      "INSERT INTO item (name) VALUES ('d')",
      'WITH x AS (SELECT 1) DELETE FROM item',
      'EXPLAIN DELETE FROM item',
      'DROP TABLE item',
      'PRAGMA user_version = 3',
      'PRAGMA user_version',
      'VACUUM',
      'SELECT 1; DELETE FROM item',
      "SELECT ';'; DELETE FROM item",
      'SELECT 1 /* x */; DELETE FROM item',
      'BEGIN',
      '',
      '-- nothing',
    ]) {
      await expectLater(query(sql), throwsA(isA<Exception>()), reason: sql);
    }
    expect(await count(), 3);
    expect((await db.rawQuery('PRAGMA user_version')).first['user_version'], 0);
  });

  test('executes with writes on', () async {
    expect(
      () => debugRunCall('sqflite.execute', {
        'db': 'app',
        'sql': 'DELETE FROM item',
      }),
      throwsA(isA<Exception>()),
    );
    expect(await execute("DELETE FROM item WHERE name != 'a'"), {'changes': 2});
    expect(await execute('CREATE INDEX item_name ON item (name)'), {
      'changes': 0,
    });
    expect(
      await execute("INSERT INTO item (name) VALUES ('z') RETURNING id"),
      containsPair('rows', [
        [2],
      ]),
    );
    expect(
      await execute('PRAGMA user_version'),
      containsPair('rows', [
        [0],
      ]),
    );
    expect(() => execute('COMMIT'), throwsA(isA<Exception>()));
    expect(await count(), 2);
  });

  test('caps rows and encodes values JSON cannot hold', () async {
    await db.execute('CREATE TABLE big (n INTEGER)');
    await db.execute(
      'WITH RECURSIVE c(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM c '
      'WHERE n < 600) INSERT INTO big SELECT n FROM c',
    );
    final big = await query('SELECT n FROM big') as Map;
    expect(big['rows'], hasLength(500));
    expect(big['more'], true);

    final cells =
        await query(
              "SELECT x'00ff10', 9007199254740993, 1e999, "
              "printf('%.70000c', 'x')",
            )
            as Map;
    final [row as List] = cells['rows'] as List;
    expect(row[0], {'blob': 3, 'head': '00 ff 10'});
    expect(row[1], {'int': '9007199254740993'});
    expect(row[2], {'real': 'Infinity'});
    expect(row[3], containsPair('length', 70000));
  });
}
