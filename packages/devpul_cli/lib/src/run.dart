import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'reload.dart';

/// Runs `flutter run`, or `dart run` outside a Flutter project, with [args]
/// and the terminal, and passes [connect] each VM service URL the tool
/// writes. [ui] is the page the app links to. A `dart run` app hot reloads
/// when a `.dart` file is saved; flutter run has its own. Returns the tool's
/// exit code.
Future<int> runApp(
  List<String> args, {
  required Uri ui,
  required Future<void> Function(String vmUrl) connect,
}) async {
  final dir = await Directory.systemTemp.createTemp('devpul');
  final info = File('${dir.path}${Platform.pathSeparator}vm');
  final flutter = _isFlutter(Directory.current);
  final (executable, arguments) = toolCommand(
    args,
    ui: ui,
    info: info,
    flutter: flutter,
  );
  final Process process;
  try {
    process = await Process.start(
      executable,
      arguments,
      mode: ProcessStartMode.inheritStdio,
      runInShell: Platform.isWindows,
    );
  } on ProcessException catch (e) {
    stderr.writeln('devpul: cannot start $executable: ${e.message}');
    await dir.delete(recursive: true);
    return 1;
  }
  // The terminal sends Ctrl+C to both; the tool decides when to stop.
  final signals = [
    ProcessSignal.sigint.watch().listen((_) {}),
    if (!Platform.isWindows)
      ProcessSignal.sigterm.watch().listen((_) => process.kill()),
  ];
  final reload = flutter
      ? null
      : HotReload(Directory.current.path, log: stdout.writeln);
  String? last;
  final poll = Timer.periodic(const Duration(milliseconds: 250), (_) {
    final url = readServiceInfo(info);
    if (url == null || url == last) return;
    if (reload != null && last == null) {
      reload.start();
      stdout.writeln('Hot reload on save.');
    }
    last = url;
    reload?.vmUrl = url;
    unawaited(connect(url));
  });
  final code = await process.exitCode;
  poll.cancel();
  await reload?.stop();
  for (final signal in signals) {
    await signal.cancel();
  }
  await dir.delete(recursive: true);
  return code;
}

/// The tool and arguments [runApp] starts. A flutter `--profile` run keeps
/// DevPul in the build with `DEVPUL_PROFILE`.
(String, List<String>) toolCommand(
  List<String> args, {
  required Uri ui,
  required File info,
  required bool flutter,
}) {
  final define = 'DEVPUL_UI=$ui';
  return flutter
      ? (
          'flutter',
          [
            'run',
            '--vmservice-out-file=${info.path}',
            '--dart-define=$define',
            if (args.contains('--profile')) '--dart-define=DEVPUL_PROFILE=true',
            ...args,
          ],
        )
      : (
          'dart',
          [
            'run',
            '--enable-vm-service=0',
            '--write-service-info=${info.uri}',
            '-D$define',
            ...args,
          ],
        );
}

/// The URL in a `flutter run --vmservice-out-file` file (plain text) or a
/// `dart --write-service-info` file (JSON), or null until it is complete.
String? readServiceInfo(File file) {
  try {
    final text = file.readAsStringSync().trim();
    final url = text.startsWith('{')
        ? (jsonDecode(text) as Map<String, Object?>)['uri']
        : text;
    return url is String && (url.endsWith('/') || url.endsWith('/ws'))
        ? url
        : null;
  } on Exception {
    return null;
  }
}

bool _isFlutter(Directory dir) {
  final pubspec = File('${dir.path}${Platform.pathSeparator}pubspec.yaml');
  return pubspec.existsSync() &&
      RegExp(
        r'^\s+sdk:\s*flutter\s*$',
        multiLine: true,
      ).hasMatch(pubspec.readAsStringSync());
}
