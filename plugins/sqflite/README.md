# sqflite

An SQLite tab for DevPul: the databases the app passes in, their tables and views with row counts and schema, pages of rows, and a SQL console. Reads run as they are; with Allow writes on in the Plugins tab, the console runs any statement.

```sh
devpul add sqflite
```

```dart
import 'devpul/plugins.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  DevpulPlugins.install();
  final db = await openDatabase('app.db');
  DevpulSqflite.add(db, name: 'app');
  runApp(const App());
}
```

sqflite keeps no list of open databases, so pass each one; the name defaults to the file name. The tab uses the app's own connection. It works with `sqflite` and `sqflite_common_ffi` (desktop, web, plain Dart), and does nothing unless `Devpul.included`.

Limits:

- With writes off, the console takes one `SELECT`, `WITH` or `VALUES` statement, optionally under `EXPLAIN`, and refuses it when SQLite's plan writes. Read pragmas as `SELECT * FROM pragma_table_info('t')`.
- `BEGIN`, `COMMIT` and other transaction statements are refused: each statement commits on its own.
- A run returns at most 500 rows or 1 MB. Blobs show their size and first 32 bytes, text over 64 KB is cut.
- Columns with the same name show once, as sqflite returns rows as maps.
- A statement that takes over 5 seconds keeps running in the app after the tab stops waiting.

Needs `sqflite_common` 2.4 or later.
