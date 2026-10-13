import 'dart:convert';

import 'package:devpul/devpul.dart';
import 'package:flutter/material.dart';

import 'overrides_plugin.dart';

/// Lets the UI's Overrides tab change the text scale, brightness, locale,
/// bold text and disabled animations the app sees, as if set on the device.
///
/// Sends an `overrides` event with the values in effect at start and on
/// each change. Overrides last until the app restarts.
///
/// ```dart
/// MaterialApp(builder: DevpulApp.builder)
/// ```
abstract final class DevpulApp {
  /// A [MaterialApp.builder], or a [WidgetsApp.builder] in any app built on
  /// [WidgetsApp]. With a builder of your own, wrap its result:
  /// `builder: (context, child) => DevpulApp.builder(context, yours(child))`.
  static Widget builder(BuildContext context, Widget? child) {
    child ??= const SizedBox.shrink();
    // The constant first, so dart2js drops the rest from release builds.
    if (!Devpul.included || !Devpul.enabled) return child;
    _register();
    return _Overrides(child: child);
  }
}

var _registered = false;

void _register() {
  if (_registered) return;
  _registered = true;
  Devpul.plugin(
    'overrides',
    () => overridesPlugin,
    origin: 'devpul_flutter',
    description:
        'Text scale, brightness, locale, bold text and animations, '
        'overridden in the running app.',
  );
  Devpul.handle(
    'overrides.state',
    (_) => _state(),
    description:
        'The overrides set, the values the platform gives, the locales the '
        'app supports and its themeMode.',
  );
  // Like navigating: changes what the app shows, not what it stores.
  Devpul.handle(
    'overrides.set',
    _apply,
    sensitive: true,
    description:
        'Sets overrides and returns the state. Args, each optional, null '
        'for the platform value: textScale (number), brightness (light, '
        'dark), locale (a supported tag), boldText, disableAnimations.',
  );
}

// Null leaves the platform's value.
typedef _Set = ({
  double? textScale,
  Brightness? brightness,
  Locale? locale,
  bool? boldText,
  bool? disableAnimations,
});

final _set = ValueNotifier<_Set>((
  textScale: null,
  brightness: null,
  locale: null,
  boldText: null,
  disableAnimations: null,
));

// Read in the last build, for the handlers.
Map<String, Object?> _system = const {};
List<Locale> _supported = const [];
ThemeMode? _themeMode;
String? _sent;

Map<String, Object?> _overrides() => {
  'textScale': ?_set.value.textScale,
  'brightness': ?_set.value.brightness?.name,
  'locale': ?_set.value.locale?.toLanguageTag(),
  'boldText': ?_set.value.boldText,
  'disableAnimations': ?_set.value.disableAnimations,
};

Map<String, Object?> _state() => {
  'overrides': _overrides(),
  'system': _system,
  'locales': [for (final l in _supported) l.toLanguageTag()],
  'themeMode': ?_themeMode?.name,
};

Map<String, Object?> _apply(Map<String, Object?> args) {
  var (:textScale, :brightness, :locale, :boldText, :disableAnimations) =
      _set.value;
  for (final MapEntry(:key, :value) in args.entries) {
    switch (key) {
      case 'textScale':
        if (value != null && (value is! num || value <= 0 || value > 10)) {
          throw const _OverridesError('textScale is a number up to 10.');
        }
        textScale = (value as num?)?.toDouble();
      case 'brightness':
        brightness = switch (value) {
          null => null,
          'light' => Brightness.light,
          'dark' => Brightness.dark,
          _ => throw const _OverridesError('brightness is light or dark.'),
        };
      case 'locale':
        locale = value == null
            ? null
            : _supported.firstWhere(
                (l) => l.toLanguageTag() == value,
                orElse: () => throw _OverridesError(
                  'The app supports ${_supported.map((l) => l.toLanguageTag()).join(', ')}.',
                ),
              );
      case 'boldText':
        boldText = _bool(key, value);
      case 'disableAnimations':
        disableAnimations = _bool(key, value);
      default:
        throw _OverridesError(
          'No override named $key. Overrides: textScale, brightness, locale, '
          'boldText, disableAnimations.',
        );
    }
  }
  _set.value = (
    textScale: textScale,
    brightness: brightness,
    locale: locale,
    boldText: boldText,
    disableAnimations: disableAnimations,
  );
  return _state();
}

bool? _bool(String key, Object? value) => value == null || value is bool
    ? value as bool?
    : throw _OverridesError('$key is true or false.');

class _Overrides extends StatelessWidget {
  const _Overrides({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) =>
      ValueListenableBuilder(valueListenable: _set, builder: _build);

  Widget _build(BuildContext context, _Set set, Widget? _) {
    final platform = MediaQuery.of(context);
    final platformLocale = Localizations.localeOf(context);
    final app = context.findAncestorWidgetOfExactType<MaterialApp>();
    _supported =
        context
            .findAncestorWidgetOfExactType<WidgetsApp>()
            ?.supportedLocales
            .toList() ??
        const [];
    _themeMode = app == null ? null : app.themeMode ?? ThemeMode.system;
    _system = _values(platform, platformLocale);

    final data = platform.copyWith(
      textScaler: set.textScale == null
          ? null
          : TextScaler.linear(set.textScale!),
      platformBrightness: set.brightness,
      boldText: set.boldText,
      disableAnimations: set.disableAnimations,
    );
    final overridden = _overrides().keys.toList();
    _emit({
      ..._values(data, set.locale ?? platformLocale),
      if (overridden.isNotEmpty) 'overridden': overridden,
    });

    var result = child;
    // MaterialApp picks its theme above the builder, from the platform's
    // brightness; pick again from the overridden one.
    if (app != null) result = _theme(app, data, result);
    return MediaQuery(
      data: data,
      child: Localizations.override(
        context: context,
        locale: set.locale,
        child: result,
      ),
    );
  }
}

Map<String, Object?> _values(MediaQueryData data, Locale locale) => {
  'textScale': data.textScaler.scale(100).round() / 100,
  'brightness': data.platformBrightness.name,
  'locale': locale.toLanguageTag(),
  'boldText': data.boldText,
  'disableAnimations': data.disableAnimations,
};

void _emit(Map<String, Object?> values) {
  final encoded = jsonEncode(values);
  if (encoded == _sent) return;
  _sent = encoded;
  Devpul.emit('overrides', values);
}

// As MaterialApp does in its own builder.
Widget _theme(MaterialApp app, MediaQueryData data, Widget child) {
  final mode = app.themeMode ?? ThemeMode.system;
  final dark =
      mode == ThemeMode.dark ||
      (mode == ThemeMode.system && data.platformBrightness == Brightness.dark);
  final contrast = data.highContrast;
  final theme =
      (dark && contrast ? app.highContrastDarkTheme : null) ??
      (dark ? app.darkTheme : null) ??
      (contrast ? app.highContrastTheme : null) ??
      app.theme ??
      ThemeData();
  return AnimatedTheme(
    data: theme,
    duration: app.themeAnimationStyle?.duration ?? app.themeAnimationDuration,
    curve: app.themeAnimationStyle?.curve ?? app.themeAnimationCurve,
    child: DefaultSelectionStyle(
      selectionColor:
          theme.textSelectionTheme.selectionColor ??
          theme.colorScheme.primary.withValues(alpha: 0.4),
      cursorColor:
          theme.textSelectionTheme.cursorColor ?? theme.colorScheme.primary,
      child: child,
    ),
  );
}

final class _OverridesError implements Exception {
  const _OverridesError(this.message);

  final String message;

  @override
  String toString() => message;
}
