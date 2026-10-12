import 'package:path/path.dart' as p;

/// Whether [path] sits in a dot folder or `build` under [root], where tools
/// such as pub, git and build_runner write.
bool inToolOutput(String root, String path) => p
    .split(p.relative(p.dirname(path), from: root))
    .any((name) => name == 'build' || (name.startsWith('.') && name != '.'));
