# local_notifications

A Notifications tab for DevPul: the app's `flutter_local_notifications` that are scheduled and shown, with id, title, body and payload, and the response that launched the app. Responses (taps, actions, dismissals) are events (`local_notifications.response`) listed in the tab, newest first. With Allow writes on in the Plugins tab, cancel a notification or show a test one with a title, body and payload of your choosing, to check what the app does with its tap.

```sh
devpul add local_notifications
```

```dart
import 'package:flutter_local_notifications/flutter_local_notifications.dart';

import 'devpul/plugins.dart';

Future<void> main() async {
  DevpulPlugins.install();
  DevpulLocalNotifications.install();
  await FlutterLocalNotificationsPlugin().initialize(
    settings: settings,
    onDidReceiveNotificationResponse: DevpulLocalNotifications.wrap(onResponse),
  );
  runApp(const App());
}
```

`wrap` returns the callback unchanged unless `Devpul.included`, and so does `install`. Responses in `onDidReceiveBackgroundNotificationResponse` run in another isolate and are not sent.

Test notifications use `install(details: ...)`, so pass the app's own `NotificationDetails` to test its channel, sound or actions. Without them Android posts on a channel named DevPul, which then shows in the app's notification settings.

Android, iOS, macOS and Windows list scheduled and shown notifications; web, from 22, lists shown ones; Linux lists neither, and the tab says so.
