import 'dart:convert';
import 'dart:ui' as ui;

import 'package:devpul/devpul.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';

import 'platform.dart' if (dart.library.io) 'platform_io.dart';

void handleReports() {
  Devpul.handle(
    'flutter.screenshot',
    (_) => _screenshot(),
    description:
        'The app window as it last drew, as {image (a PNG data URL), width, '
        'height} in physical pixels. Large: about 1 MB on a phone. Platform '
        'views are left out.',
  );
  Devpul.handle(
    'flutter.device',
    (_) => _device(),
    description:
        'Platform, OS version, build mode, Flutter and Dart versions, locale, '
        'window size, text scale, brightness and accessibility settings.',
  );
}

Future<Map<String, Object?>> _screenshot() async {
  final view = RendererBinding.instance.renderViews.firstOrNull;
  // debugLayer is null in profile builds. The root layer applies the pixel
  // ratio, so bounds are physical pixels.
  // ignore: invalid_use_of_protected_member
  final layer = view?.layer;
  if (view == null || layer is! OffsetLayer) {
    throw StateError('The app has not drawn a frame yet.');
  }
  final image = await layer.toImage(
    Offset.zero & view.flutterView.physicalSize,
  );
  try {
    final png = await image.toByteData(format: ui.ImageByteFormat.png);
    return {
      'image':
          'data:image/png;base64,${base64Encode(png!.buffer.asUint8List())}',
      'width': image.width,
      'height': image.height,
    };
  } finally {
    image.dispose();
  }
}

Map<String, Object?> _device() {
  final dispatcher = RendererBinding.instance.platformDispatcher;
  final view = dispatcher.implicitView ?? dispatcher.views.firstOrNull;
  final a11y = dispatcher.accessibilityFeatures;
  return {
    'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
    'os': ?(kIsWeb ? defaultTargetPlatform.name : osVersion),
    'mode': kDebugMode ? 'debug' : 'profile',
    'flutter': ?FlutterVersion.version,
    'dart': ?FlutterVersion.dartVersion,
    'locale': dispatcher.locale.toLanguageTag(),
    if (view != null) ...{
      'width': view.physicalSize.width / view.devicePixelRatio,
      'height': view.physicalSize.height / view.devicePixelRatio,
      'pixelRatio': view.devicePixelRatio,
    },
    'textScale': dispatcher.textScaleFactor,
    'brightness': dispatcher.platformBrightness.name,
    'accessibility': [
      if (a11y.accessibleNavigation) 'accessibleNavigation',
      if (a11y.boldText) 'boldText',
      if (a11y.highContrast) 'highContrast',
      if (a11y.invertColors) 'invertColors',
      if (a11y.disableAnimations) 'disableAnimations',
      if (a11y.reduceMotion) 'reduceMotion',
      if (a11y.onOffSwitchLabels) 'onOffSwitchLabels',
    ],
  };
}
