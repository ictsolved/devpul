/// Streams HTTP calls, errors and custom events from a debug build to the
/// DevPul browser UI over the Dart VM service.
library;

export 'src/config.dart';
export 'src/devpul.dart' show Devpul;
export 'src/encode.dart' show toJsonSafe, truncatedKey;
export 'src/http.dart';
