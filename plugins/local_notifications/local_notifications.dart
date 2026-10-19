import 'package:devpul/devpul.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Serves the app's flutter_local_notifications to the Notifications tab.
abstract final class DevpulLocalNotifications {
  /// Lets the Notifications tab list scheduled and shown notifications and
  /// the one that launched the app and, with Allow writes on, cancel them
  /// and show a test one with [details]. Pass the app's own [details] to
  /// test its channel; without them Android posts on a DevPul channel. Does
  /// nothing unless [Devpul.included].
  static void install({NotificationDetails? details}) {
    if (!Devpul.included) return;
    final plugin = FlutterLocalNotificationsPlugin();
    Devpul.handle(
      'local_notifications.list',
      (_) async => {
        'pending': await _supported(
          () async => [
            for (final n in await plugin.pendingNotificationRequests())
              {
                'id': n.id,
                'title': ?n.title,
                'body': ?n.body,
                'payload': ?_nonEmpty(n.payload),
              },
          ],
        ),
        'active': await _supported(
          () async => [
            for (final n in await plugin.getActiveNotifications())
              {
                'id': ?n.id,
                'title': ?n.title,
                'body': ?n.body,
                'payload': ?_nonEmpty(n.payload),
                'channel': ?n.channelId,
                'tag': ?n.tag,
                'group': ?n.groupKey,
              },
          ],
        ),
        'launch': await _supported(() async {
          final launch = await plugin.getNotificationAppLaunchDetails();
          final response = launch?.notificationResponse;
          return {
            'launched': launch?.didNotificationLaunchApp ?? false,
            if (response != null) 'response': _response(response),
          };
        }),
      },
      description:
          'Scheduled (pending) and shown (active) notifications, and whether '
          'one launched the app; each is null where the platform has none.',
    );
    Devpul.handle(
      'local_notifications.show',
      (args) => plugin.show(
        id: _id(args),
        title: _string(args, 'title'),
        body: _string(args, 'body'),
        payload: _string(args, 'payload'),
        notificationDetails: details ?? _details,
      ),
      writes: true,
      description:
          'Shows a notification now with the details install got. Args: id, '
          'and optional title, body, payload.',
    );
    Devpul.handle(
      'local_notifications.cancel',
      (args) => plugin.cancel(id: _id(args), tag: _string(args, 'tag')),
      writes: true,
      description:
          'Cancels a scheduled notification or removes a shown one. Args: id, '
          'and tag on Android when it was shown with one.',
    );
  }

  /// Returns a callback that sends each notification response to DevPul,
  /// then calls [callback]. Pass it as `onDidReceiveNotificationResponse` to
  /// `initialize`. Returns [callback] itself unless [Devpul.included].
  static DidReceiveNotificationResponseCallback wrap(
    DidReceiveNotificationResponseCallback callback,
  ) {
    if (!Devpul.included) return callback;
    return (response) {
      Devpul.emit('local_notifications.response', _response(response));
      return callback(response);
    };
  }
}

const _details = NotificationDetails(
  android: AndroidNotificationDetails('devpul', 'DevPul'),
);

Map<String, Object?> _response(NotificationResponse response) => {
  'id': ?response.id,
  // A name, not a switch: flutter_local_notifications 22 adds a value.
  'type': response.notificationResponseType.name,
  'action': ?_nonEmpty(response.actionId),
  'input': ?response.input,
  'payload': ?_nonEmpty(response.payload),
  if (response.data.isNotEmpty) 'data': response.data,
};

// Android and Apple report no payload as an empty string.
String? _nonEmpty(String? value) =>
    value == null || value.isEmpty ? null : value;

Future<T?> _supported<T>(Future<T> Function() read) async {
  try {
    return await read();
  } on UnimplementedError {
    return null;
  }
}

int _id(Map<String, Object?> args) => switch (args['id']) {
  final int id => id,
  _ => throw const _NotificationsError('No id given.'),
};

String? _string(Map<String, Object?> args, String name) => switch (args[name]) {
  final String value when value.isNotEmpty => value,
  _ => null,
};

final class _NotificationsError implements Exception {
  const _NotificationsError(this.message);

  final String message;

  @override
  String toString() => message;
}
