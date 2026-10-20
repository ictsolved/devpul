# app_links

A Links tab for DevPul: the app's initial link and each link the app receives through `app_links`, newest first. Click a link for its scheme, host, path, query parameters and fragment. Each link is also an event (`app_links.link`).

With Allow writes on in the Plugins tab, a box opens a test link: it goes on the app's link stream as if the platform had opened it, marked "from DevPul" in the list. A received link can be put in the box to edit and open again.

```sh
devpul add app_links
```

```dart
import 'package:app_links/app_links.dart';

import 'devpul/plugins.dart';

void main() {
  DevpulAppLinks.wrap(AppLinks().uriLinkStream).listen(openLink);
  runApp(const App());
}
```

`wrap` returns the stream unchanged unless `Devpul.included`. The stream it returns is a broadcast stream.

Test links reach only listeners of a wrapped stream, not `getInitialLink`, `getLatestLink` or code that listens to `AppLinks` directly. To go through the platform, open the link from outside: `adb shell am start -a android.intent.action.VIEW -d <link>` on Android, `xcrun simctl openurl booted <link>` on the iOS simulator, `open <link>` on macOS, or the app's executable with the link as its argument on Linux.

The initial link is `getInitialLink`'s: the link that launched the app, or on Linux the first link the app received.
