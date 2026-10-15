import 'dart:convert';
import 'dart:io';

// Builds the example and contract/app for release and fails on debug-only
// strings left in them: service extensions, event kinds, plugin modules.
// Native profile builds keep them only with DEVPUL_PROFILE.

const _core = ['ext.devpul.', 'app.session', 'http.mocks.set', 'http.paused'];

// A line that dart2js and AOT store as written: no quotes or escapes.
final _plain = RegExp(r'^[A-Za-z0-9 .,:;/(){}\[\]_=-]{16,}$');

Future<void> main() async {
  Directory.current = File.fromUri(Platform.script).parent.parent;
  final out = Directory.systemTemp.createTempSync('devpul_release_check');
  try {
    final contract = [..._core, ..._pluginMarkers('contract/app')];
    final example = [
      ..._core,
      'http.request',
      // devpul_flutter's Routes and Overrides modules.
      'function stackAt(events, event) {',
      'const SCALES = [0.85, 1, 1.15, 1.3, 1.5, 2, 3];',
      ..._pluginMarkers('examples/devpul_example'),
    ];
    var failed = false;

    const app = 'examples/devpul_example';
    // Debug and opted-in native profile builds keep DevPul, so every needle
    // must be there; otherwise the checks below prove nothing.
    await _run('dart', [
      'compile',
      'js',
      '-o',
      '${out.path}/debug.js',
      'contract/app/bin/main.dart',
    ]);
    await _run('flutter', [
      'build',
      'linux',
      '--profile',
      '--dart-define=DEVPUL_PROFILE=true',
    ], dir: app);
    final kept = {
      '${out.path}/debug.js': contract,
      '$app/build/linux/x64/profile/bundle/lib/libapp.so': example,
    };
    for (final MapEntry(key: path, value: needles) in kept.entries) {
      final missing = needles.where((n) => !_contains(path, n)).toList();
      if (missing.isEmpty) {
        stdout.writeln('ok ${_name(path, out)} keeps them');
        continue;
      }
      stderr.writeln('Not found in ${_name(path, out)}:');
      for (final needle in missing) {
        stderr.writeln('  $needle');
      }
      failed = true;
    }

    await _run('dart', [
      'compile',
      'exe',
      '-o',
      '${out.path}/app',
      'contract/app/bin/main.dart',
    ]);
    await _run('dart', [
      'compile',
      'js',
      '-Ddart.vm.product=true',
      '-o',
      '${out.path}/release.js',
      'contract/app/bin/main.dart',
    ]);
    // Web profile builds have no VM service, so they drop DevPul even when
    // opted in.
    await _run('dart', [
      'compile',
      'js',
      '-Ddart.vm.profile=true',
      '-DDEVPUL_PROFILE=true',
      '-o',
      '${out.path}/profile.js',
      'contract/app/bin/main.dart',
    ]);
    await _run('flutter', ['build', 'web', '--release'], dir: app);
    await _run('flutter', ['build', 'linux', '--release'], dir: app);

    final builds = {
      '${out.path}/app': contract,
      '${out.path}/release.js': contract,
      '${out.path}/profile.js': contract,
      '$app/build/web/main.dart.js': example,
      '$app/build/linux/x64/release/bundle/lib/libapp.so': example,
    };
    for (final MapEntry(key: path, value: needles) in builds.entries) {
      final found = needles.where((n) => _contains(path, n)).toList();
      if (found.isEmpty) {
        stdout.writeln('ok ${_name(path, out)}');
        continue;
      }
      stderr.writeln('In ${_name(path, out)}:');
      for (final needle in found) {
        stderr.writeln('  $needle');
      }
      failed = true;
    }
    if (failed) exitCode = 1;
  } finally {
    out.deleteSync(recursive: true);
  }
}

List<String> _pluginMarkers(String app) {
  final lock = jsonDecode(File('$app/devpul.lock').readAsStringSync()) as Map;
  return [
    for (final id in (lock['plugins'] as Map).keys) ?_marker(app, id as String),
  ];
}

String? _marker(String app, String id) {
  final dir = '$app/lib/devpul/$id';
  final manifest =
      jsonDecode(File('$dir/plugin.json').readAsStringSync()) as Map;
  final source = manifest['source'] as String?;
  if (source == null) return null;
  final lines = File(
    '$dir/$source',
  ).readAsLinesSync().map((l) => l.trim()).where(_plain.hasMatch).toList();
  if (lines.isEmpty) {
    throw StateError('$dir/$source: no plain line to look for');
  }
  return lines.reduce((a, b) => b.length > a.length ? b : a);
}

// AOT keeps a string with any non-Latin-1 character as UTF-16.
bool _contains(String path, String needle) {
  final bytes = File(path).readAsBytesSync();
  final latin1 = needle.codeUnits;
  final utf16 = [
    for (final c in needle.codeUnits) ...[c, 0],
  ];
  return _indexOf(bytes, latin1) >= 0 || _indexOf(bytes, utf16) >= 0;
}

int _indexOf(List<int> bytes, List<int> needle) {
  final first = needle.first;
  for (var i = 0; i <= bytes.length - needle.length; i++) {
    if (bytes[i] != first) continue;
    var j = 1;
    while (j < needle.length && bytes[i + j] == needle[j]) {
      j++;
    }
    if (j == needle.length) return i;
  }
  return -1;
}

String _name(String path, Directory out) =>
    path.startsWith(out.path) ? 'contract/app ${path.split('/').last}' : path;

Future<void> _run(String command, List<String> args, {String? dir}) async {
  stdout.writeln('\$ $command ${args.join(' ')}');
  final process = await Process.start(
    command,
    args,
    workingDirectory: dir,
    mode: ProcessStartMode.inheritStdio,
  );
  final code = await process.exitCode;
  if (code != 0) throw ProcessException(command, args, 'exit $code', code);
}
