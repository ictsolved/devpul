// The registry build is repo tooling on the CLI's plugin code.
// ignore_for_file: implementation_imports
import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/plugins/build_registry.dart';
import 'package:devpul_cli/src/plugins/fetch.dart';

const _usage = 'Usage: dart run tool/build_registry.dart <out-dir>';

Future<void> main(List<String> args) async {
  if (args.length != 1) {
    stderr.writeln(_usage);
    exit(64);
  }
  final out = Directory(args.single).absolute;
  final root = File.fromUri(Platform.script).parent.parent.path;
  final site = jsonDecode(File('$root/site.json').readAsStringSync()) as Map;
  final cache = Directory.systemTemp.createTempSync('devpul_registry');
  try {
    final fetcher = Fetcher(root: root, cache: cache.path)
      ..log = stdout.writeln;
    final built = await buildRegistry(
      root,
      repo: site['repo'] as String,
      fetcher: fetcher,
      log: stdout.writeln,
    );
    if (built.problems.isNotEmpty) {
      built.problems.forEach(stderr.writeln);
      exitCode = 1;
      return;
    }
    if (out.existsSync()) out.deleteSync(recursive: true);
    Directory('${out.path}/readme').createSync(recursive: true);
    File('${out.path}/registry.json').writeAsStringSync(built.json);
    for (final MapEntry(key: id, value: readme) in built.readmes.entries) {
      File('${out.path}/readme/$id.md').writeAsStringSync(readme);
    }
    stdout.writeln('Wrote ${out.path}');
  } finally {
    cache.deleteSync(recursive: true);
  }
}
