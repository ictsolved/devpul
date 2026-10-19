import 'package:devpul/devpul.dart';
// ignore: implementation_imports
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunCall;
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_test/flutter_test.dart';

import '../local_notifications.dart';

const _channel = MethodChannel('dexterous.com/flutter/local_notifications');

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late List<MethodCall> calls;
  Object? launch;

  setUp(() {
    AndroidFlutterLocalNotificationsPlugin.registerWith();
    debugDefaultTargetPlatformOverride = TargetPlatform.android;
    calls = [];
    launch = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, (call) async {
          calls.add(call);
          return switch (call.method) {
            'pendingNotificationRequests' => [
              {'id': 3, 'title': 'Reminder', 'body': null, 'payload': ''},
            ],
            'getActiveNotifications' => [
              {
                'id': 7,
                'channelId': 'news',
                'tag': 'top',
                'title': 'Hello',
                'payload': 'item/7',
              },
            ],
            'getNotificationAppLaunchDetails' => launch,
            _ => null,
          };
        });
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
  });

  tearDown(() {
    debugDefaultTargetPlatformOverride = null;
    debugOnPost = null;
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(_channel, null);
  });

  test('lists pending and active notifications', () async {
    DevpulLocalNotifications.install();
    expect(await debugRunCall('local_notifications.list'), {
      'pending': [
        {'id': 3, 'title': 'Reminder'},
      ],
      'active': [
        {
          'id': 7,
          'title': 'Hello',
          'payload': 'item/7',
          'channel': 'news',
          'tag': 'top',
        },
      ],
      'launch': {'launched': false},
    });
  });

  test('reports the notification that launched the app', () async {
    launch = {
      'notificationLaunchedApp': true,
      'notificationResponse': {
        'notificationId': 7,
        'notificationResponseType': 1,
        'actionId': 'reply',
        'input': 'ok',
        'payload': 'item/7',
      },
    };
    DevpulLocalNotifications.install();
    final result = await debugRunCall('local_notifications.list') as Map;
    expect(result['launch'], {
      'launched': true,
      'response': {
        'id': 7,
        'type': 'selectedNotificationAction',
        'action': 'reply',
        'input': 'ok',
        'payload': 'item/7',
      },
    });
  });

  test('gives null where the platform has no list', () async {
    debugDefaultTargetPlatformOverride = TargetPlatform.linux;
    FlutterLocalNotificationsPlatform.instance = _Bare();
    DevpulLocalNotifications.install();
    expect(await debugRunCall('local_notifications.list'), {
      'pending': null,
      'active': null,
      'launch': null,
    });
  });

  test('shows and cancels only with writes on', () async {
    DevpulLocalNotifications.install();
    final args = {'id': 9, 'title': 'Test', 'body': '', 'payload': 'p'};
    await expectLater(
      debugRunCall('local_notifications.show', args),
      throwsA(anything),
    );
    expect(calls, isEmpty);

    await debugRunCall('local_notifications.show', args, true);
    await debugRunCall('local_notifications.cancel', {
      'id': 7,
      'tag': 'top',
    }, true);
    expect(calls.map((c) => c.method), ['show', 'cancel']);
    final show = calls[0].arguments as Map;
    expect(show['id'], 9);
    expect(show['title'], 'Test');
    expect(show['body'], isNull);
    expect(show['payload'], 'p');
    expect((show['platformSpecifics'] as Map)['channelId'], 'devpul');
    expect(calls[1].arguments, {'id': 7, 'tag': 'top'});
  });

  test('shows with the details install got', () async {
    DevpulLocalNotifications.install(
      details: const NotificationDetails(
        android: AndroidNotificationDetails('orders', 'Orders'),
      ),
    );
    await debugRunCall('local_notifications.show', {'id': 1}, true);
    final show = calls.single.arguments as Map;
    expect((show['platformSpecifics'] as Map)['channelId'], 'orders');
  });

  test('refuses a call without an id', () async {
    DevpulLocalNotifications.install();
    await expectLater(
      debugRunCall('local_notifications.cancel', {'id': '7'}, true),
      throwsA(predicate((e) => '$e'.contains('No id given.'))),
    );
  });

  test('wrap sends each response, then calls the app', () async {
    final sent = <Map<String, Object?>>[];
    debugOnPost = (kind, event) {
      if (kind == 'local_notifications.response') {
        sent.add(event['data']! as Map<String, Object?>);
      }
    };
    final seen = <int?>[];
    final callback = DevpulLocalNotifications.wrap((r) => seen.add(r.id));
    callback(
      const NotificationResponse(
        id: 4,
        notificationResponseType: NotificationResponseType.selectedNotification,
        payload: 'order/4',
      ),
    );
    callback(
      const NotificationResponse(
        notificationResponseType: NotificationResponseType.selectedNotification,
        payload: '',
      ),
    );
    expect(seen, [4, null]);
    expect(sent, [
      {'id': 4, 'type': 'selectedNotification', 'payload': 'order/4'},
      {'type': 'selectedNotification'},
    ]);
  });
}

// A platform with nothing but the base class, as Linux has for lists.
final class _Bare extends FlutterLocalNotificationsPlatform {}
