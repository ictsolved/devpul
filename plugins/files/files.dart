import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:devpul/devpul.dart';
import 'package:path_provider/path_provider.dart';

const _web = bool.fromEnvironment('dart.library.js_interop');

// Below the UI's 5 s call timeout.
const _sizeBudget = Duration(seconds: 2);
const _maxEntries = 1000;
const _maxRead = 1 << 20;

/// Serves the app's path_provider directories to the Files tab.
abstract final class DevpulFiles {
  /// Lets the Files tab list, read and, with Allow writes on, delete files
  /// in the app's path_provider directories. Does nothing unless
  /// [Devpul.included].
  static void install() {
    if (!Devpul.included) return;
    if (_web) {
      Devpul.handle(
        'files.roots',
        (_) => throw const _FilesError(
          'Files needs dart:io; web apps have no files.',
        ),
        description: 'Fails: web apps have no files.',
      );
      return;
    }
    Devpul.handle(
      'files.roots',
      (_) async => {
        'roots': [
          for (final root in await _roots)
            {
              'name': root.name,
              'path': root.path,
              'exists': await Directory(root.path).exists(),
            },
        ],
      },
      description:
          "The app's path_provider directories: name, path, whether it "
          'exists. Other handlers take paths inside them.',
    );
    Devpul.handle(
      'files.list',
      (args) async => _list(await _inside(args)),
      description:
          'Entries of a directory, folders first, at most $_maxEntries: '
          'name, type, size, modified. Args: path.',
    );
    Devpul.handle(
      'files.size',
      (args) async => _size(await _inside(args)),
      description:
          'Total bytes and file count under a directory; partial when it '
          'took too long. Args: path.',
    );
    Devpul.handle(
      'files.read',
      (args) async => _read(await _inside(args), args),
      description:
          'Bytes of a file as base64, at most 1 MB, and its size. Args: '
          'path, offset, length.',
    );
    Devpul.handle(
      'files.delete',
      (args) async => _delete(await _inside(args, root: false)),
      writes: true,
      description: 'Deletes a file, link or directory tree. Args: path.',
    );
  }
}

typedef _Root = ({String name, String path});

final Future<List<_Root>> _roots = () async {
  final found = <String, List<String>>{};
  Future<void> add(String name, Future<Directory?> Function() get) async {
    try {
      final dir = await get();
      if (dir != null) (found[_normal(dir.path)] ??= []).add(name);
    } on Object {
      // Not on this platform.
    }
  }

  // Support first: on desktops Documents and Downloads are the user's own.
  await add('Support', getApplicationSupportDirectory);
  await add('Documents', getApplicationDocumentsDirectory);
  await add('Cache', getApplicationCacheDirectory);
  await add('Temporary', getTemporaryDirectory);
  await add('Library', getLibraryDirectory);
  await add('External', getExternalStorageDirectory);
  await add('Downloads', getDownloadsDirectory);
  return [
    for (final MapEntry(:key, :value) in found.entries)
      (name: value.join(', '), path: key),
  ];
}();

String _normal(String path) {
  final windows = Platform.isWindows;
  final out = Uri.file(
    File(path).absolute.path,
    windows: windows,
  ).normalizePath().toFilePath(windows: windows);
  final sep = Platform.pathSeparator;
  return out.length > 1 && out.endsWith(sep)
      ? out.substring(0, out.length - 1)
      : out;
}

// A guard against slips, like the writes switch: links are not resolved.
Future<String> _inside(Map<String, Object?> args, {bool root = true}) async {
  final given = args['path'];
  if (given is! String || given.isEmpty) {
    throw const _FilesError('No path given.');
  }
  final path = _normal(given);
  for (final r in await _roots) {
    if (path == r.path) {
      if (root) return path;
      throw _FilesError('$path is the ${r.name} directory itself.');
    }
    if (path.startsWith('${r.path}${Platform.pathSeparator}')) return path;
  }
  throw _FilesError('$path is outside the Files directories.');
}

Future<Map<String, Object?>> _list(String path) async {
  final all = await Directory(path).list(followLinks: false).toList();
  all.sort((a, b) {
    final dirs = (b is Directory ? 1 : 0) - (a is Directory ? 1 : 0);
    return dirs != 0 ? dirs : a.path.compareTo(b.path);
  });
  return {
    'path': path,
    'total': all.length,
    'entries': [for (final e in all.take(_maxEntries)) await _entry(path, e)],
  };
}

Future<Map<String, Object?>> _entry(String dir, FileSystemEntity e) async {
  final name = e.path.substring(dir.length + 1);
  if (e is Link) {
    return {
      'name': name,
      'path': e.path,
      'type': 'link',
      'target': await e.target().catchError((Object _) => ''),
    };
  }
  final stat = await e.stat();
  return {
    'name': name,
    'path': e.path,
    'type': e is Directory ? 'dir' : 'file',
    if (e is File) 'size': stat.size,
    'modified': stat.modified.millisecondsSinceEpoch,
  };
}

Future<Map<String, Object?>> _size(String path) async {
  final watch = Stopwatch()..start();
  var size = 0;
  var files = 0;
  var partial = false;
  final entries = Directory(path)
      .list(recursive: true, followLinks: false)
      .handleError((Object _) => partial = true);
  await for (final e in entries) {
    if (watch.elapsed > _sizeBudget) {
      partial = true;
      break;
    }
    if (e is! File) continue;
    try {
      size += await e.length();
      files++;
    } on FileSystemException {
      partial = true;
    }
  }
  return {'size': size, 'files': files, 'partial': partial};
}

Future<Map<String, Object?>> _read(
  String path,
  Map<String, Object?> args,
) async {
  final offset = (args['offset'] as num?)?.toInt() ?? 0;
  final length = min((args['length'] as num?)?.toInt() ?? _maxRead, _maxRead);
  if (offset < 0 || length < 0) {
    throw const _FilesError('offset and length must not be negative.');
  }
  final file = await File(path).open();
  try {
    final size = await file.length();
    await file.setPosition(min(offset, size));
    return {'size': size, 'data': base64Encode(await file.read(length))};
  } finally {
    await file.close();
  }
}

Future<void> _delete(String path) async {
  switch (await FileSystemEntity.type(path, followLinks: false)) {
    case FileSystemEntityType.directory:
      await Directory(path).delete(recursive: true);
    case FileSystemEntityType.link:
      await Link(path).delete();
    case FileSystemEntityType.notFound:
      throw _FilesError('$path does not exist.');
    default:
      await File(path).delete();
  }
}

final class _FilesError implements Exception {
  const _FilesError(this.message);

  final String message;

  @override
  String toString() => message;
}
