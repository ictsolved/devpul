enum ConsoleMode { off, summary, verbose }

typedef HeaderRedactor = Map<String, Object?> Function(
  Uri url,
  Map<String, Object?> headers,
);

typedef BodyRedactor = Object? Function(Uri url, Object? body);

final class DevpulConfig {
  const DevpulConfig({
    this.enabled = true,
    this.console = ConsoleMode.summary,
    this.ansiColors = true,
    this.maxValueLength = 1024 * 1024,
    this.backlogSize = 16 * 1024 * 1024,
    this.ignoreUrls = const [],
    this.ignoreMethods = const {},
    this.redactHeaders,
    this.redactBody,
    this.idGenerator,
  });

  /// Has no effect in release and profile builds, which never emit.
  final bool enabled;

  final ConsoleMode console;
  final bool ansiColors;

  /// Characters of encoded JSON per top-level event field. Longer values are
  /// replaced by a truncation marker carrying a preview of this length.
  final int maxValueLength;

  /// Characters of encoded JSON kept in memory per isolate for
  /// `ext.devpul.backlog`, oldest dropped first.
  final int backlogSize;

  /// Matched against the full URL. A [String] matches as a substring.
  final List<Pattern> ignoreUrls;

  /// Upper case, for example `{'OPTIONS'}`.
  final Set<String> ignoreMethods;

  final HeaderRedactor? redactHeaders;
  final BodyRedactor? redactBody;

  /// Defaults to a counter per isolate.
  final Object Function()? idGenerator;

  bool ignores(String method, Uri url) {
    if (ignoreMethods.contains(method.toUpperCase())) return true;
    final text = url.toString();
    return ignoreUrls.any((p) => p.allMatches(text).isNotEmpty);
  }
}
