import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:devpul/devpul.dart';

/// Sends the app's incoming links to DevPul for the Links tab.
abstract final class DevpulAppLinks {
  /// Returns a stream of [links] that sends each link to DevPul. With Allow
  /// writes on, the tab opens test links on it, as if the platform had
  /// opened them. Returns [links] itself unless [Devpul.included].
  static Stream<Uri> wrap(Stream<Uri> links) {
    if (!Devpul.included) return links;
    if (!_handling) {
      _handling = true;
      Devpul.handle(
        'app_links.initial',
        (_) async => {'link': ?await AppLinks().getInitialLinkString()},
        description:
            "app_links' initial link: the one that launched the app, or on "
            'Linux the first one it received.',
      );
      Devpul.handle(
        'app_links.open',
        (args) {
          final link = switch (args['link']) {
            final String link when link.trim().isNotEmpty => link.trim(),
            _ => throw const _LinksError('No link given.'),
          };
          final uri = Uri.tryParse(link);
          if (uri == null) throw _LinksError('Not a link: $link');
          if (_listening.isEmpty) {
            throw const _LinksError(
              'Nothing listens to the stream DevpulAppLinks.wrap returned.',
            );
          }
          Devpul.emit('app_links.link', {'link': '$uri', 'devpul': true});
          for (final controller in _listening) {
            controller.add(uri);
          }
          return null;
        },
        writes: true,
        description:
            'Puts a link on the stream the app wrapped, as if the platform '
            'had opened it; its event carries devpul: true. Args: link.',
      );
    }
    StreamSubscription<Uri>? subscription;
    late final StreamController<Uri> controller;
    controller = StreamController.broadcast(
      onListen: () {
        _listening.add(controller);
        subscription = links.listen(
          (uri) {
            Devpul.emit('app_links.link', {'link': '$uri'});
            controller.add(uri);
          },
          onError: controller.addError,
          onDone: () {
            _listening.remove(controller);
            controller.close();
          },
        );
      },
      onCancel: () {
        _listening.remove(controller);
        subscription?.cancel();
        subscription = null;
      },
    );
    return controller.stream;
  }

  static var _handling = false;
  static final _listening = <StreamController<Uri>>{};
}

final class _LinksError implements Exception {
  const _LinksError(this.message);

  final String message;

  @override
  String toString() => message;
}
