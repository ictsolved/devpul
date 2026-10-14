enum ConsoleMode { off, summary, verbose }

// `devpul run` passes its own server.
const _uiUrl = bool.hasEnvironment('DEVPUL_UI')
    ? String.fromEnvironment('DEVPUL_UI')
    : null;

typedef HeaderRedactor =
    Map<String, Object?> Function(Uri url, Map<String, Object?> headers);

typedef BodyRedactor = Object? Function(Uri url, Object? body);

final class DevpulConfig {
  const DevpulConfig({
    this.enabled = true,
    this.console = ConsoleMode.summary,
    this.ansiColors,
    this.printLink = true,
    this.uiUrl = _uiUrl,
    this.maxValueLength = 1024 * 1024,
    this.backlogSize = 16 * 1024 * 1024,
    this.ignoreUrls = const [],
    this.ignoreMethods = const {},
    this.redactHeaders,
    this.redactBody,
    this.idGenerator,
  });

  /// Has no effect unless `Devpul.included`.
  final bool enabled;

  final ConsoleMode console;

  /// Colored console lines. Null leaves it to `Devpul.ansiColorsByDefault`,
  /// on except in Flutter on iOS.
  final bool? ansiColors;

  /// The app prints a link to DevPul at startup and when the VM service URL
  /// changes, unless [console] is off.
  final bool printLink;

  /// The link is `<uiUrl>#connect=<VM service URL>`. Null links the DevPul
  /// tab of DevTools, served by the app's VM service.
  final String? uiUrl;

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
}
