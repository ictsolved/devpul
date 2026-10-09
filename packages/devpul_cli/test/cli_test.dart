import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/cli.dart';
import 'package:devpul_cli/src/run.dart';
import 'package:test/test.dart';

void main() {
  group('parseArgs', () {
    test('takes options, then a URL', () {
      final options = parseArgs([
        '--port=8000',
        '--no-open',
        '--plugin',
        'a.js',
        'http://127.0.0.1:1/a=/',
      ]);
      expect(options.port, 8000);
      expect(options.open, isFalse);
      expect(options.plugins, ['a.js']);
      expect(options.rest, ['http://127.0.0.1:1/a=/']);
      expect(options.run, isFalse);
    });

    test('passes everything after run to the tool', () {
      final options = parseArgs([
        '--port',
        '0',
        'run',
        '-d',
        'linux',
        '--port',
      ]);
      expect(options.port, 0);
      expect(options.run, isTrue);
      expect(options.rest, ['-d', 'linux', '--port']);
    });

    test('rejects bad input', () {
      for (final args in [
        ['--port'],
        ['--port', 'x'],
        ['--port=70000'],
        ['--verbose'],
        ['a', 'b'],
      ]) {
        expect(() => parseArgs(args), throwsFormatException, reason: '$args');
      }
    });
  });

  test('reads both service info formats once complete', () async {
    final dir = await Directory.systemTemp.createTemp('devpul_info');
    addTearDown(() => dir.delete(recursive: true));
    final file = File('${dir.path}/vm');
    expect(readServiceInfo(file), isNull);
    file.writeAsStringSync('ws://127.0.0.1:1/a=/ws\n');
    expect(readServiceInfo(file), 'ws://127.0.0.1:1/a=/ws');
    file.writeAsStringSync('{"uri":"http://127.0.0.1:1/a=/"');
    expect(readServiceInfo(file), isNull);
    file.writeAsStringSync(jsonEncode({'uri': 'http://127.0.0.1:1/a=/'}));
    expect(readServiceInfo(file), 'http://127.0.0.1:1/a=/');
  });

  test('run starts dart run, connects to it and exits with its code', () async {
    final dir = await Directory.systemTemp.createTemp('devpul_run');
    addTearDown(() => dir.delete(recursive: true));
    // The build is gitignored; CI has none.
    final build = Directory('../devpul/extension/devtools/build');
    if (!build.existsSync()) {
      File('${build.path}/index.html').createSync(recursive: true);
      addTearDown(() => build.delete(recursive: true));
    }
    File('${dir.path}/app.dart').writeAsStringSync('''
import 'dart:io';
Future<void> main() async {
  print('ui ' + const String.fromEnvironment('DEVPUL_UI'));
  await Future<void>.delayed(const Duration(seconds: 2));
  exit(3);
}
''');
    final result = await Process.run(Platform.resolvedExecutable, [
      File('bin/devpul.dart').absolute.path,
      '--port=0',
      '--no-open',
      'run',
      'app.dart',
    ], workingDirectory: dir.path);
    final out = result.stdout as String;
    final ui = RegExp(r'DevPul UI at (\S+)').firstMatch(out)?.group(1);
    expect(ui, isNotNull, reason: '$out${result.stderr}');
    expect(out, contains('ui $ui'));
    expect(
      out,
      matches(RegExp('DevPul ${RegExp.escape(ui!)}#connect=http%3A%2F%2F127')),
    );
    expect(result.exitCode, 3);
  }, timeout: const Timeout(Duration(minutes: 1)));
}
