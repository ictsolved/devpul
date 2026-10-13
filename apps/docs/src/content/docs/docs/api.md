---
title: Core API
description: Devpul.session, tags, emit, log, error, action and DevpulConfig in the devpul Dart package, with redaction and ignore rules.
---

Everything here is in `package:devpul/devpul.dart`, from [devpul](https://pub.dev/packages/devpul). Calls are no-ops in release builds, in profile builds unless they [opt in](#profile-builds), and when `enabled` is false, and they never throw into your app.

## Session

```dart
Devpul.session(
  {
    'name': 'Shop',
    'version': '2.3.1',
    'env': 'staging',
    'baseUrl': 'https://api.example.com',
  },
  tags: {'env': 'staging'},
);
```

Fields are free-form and show in the status bar; pick which ones in Settings. `name` labels the app in connection chips and run dividers. The session is sent again when DevPul connects late, so it is never missing.

## Tags

```dart
Devpul.tags['user'] = 'guest';
```

Tags are added to every event from then on and become filter chips and `tag:` filters. Values are strings.

## Custom events

```dart
Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
```

Any JSON-like value works; other objects become their `toString()`. Kinds that no plugin claims show in Events. Prefer dotted names, such as `cart.updated`, so `kind:cart` finds the family. [Extending DevPul](/docs/extend/) has observers that send Riverpod and Bloc state this way.

## Logs

```dart
Devpul.log('Signed in', name: 'auth');
Devpul.log('Retrying', level: 'warn', name: 'sync');
Devpul.log('Sync failed', level: 'error', name: 'sync', error: e, stack: s);
```

`level` is free-form; `debug`, `info`, `warn` and `error` get colors. Any value logs as its `toString()`. A closure is called only when DevPul is enabled, so a costly message is not built in other builds:

```dart
Devpul.log(() => 'Cart: ${cart.items}', name: 'cart');
```

To forward `package:logging`:

```dart
Logger.root.onRecord.listen(
  (r) => Devpul.log(
    r.message,
    level: r.level.name.toLowerCase(),
    name: r.loggerName,
    error: r.error,
    stack: r.stackTrace,
  ),
);
```

In Flutter, `DevpulFlutter.captureDebugPrint()` sends `debugPrint` output too.

`developer.log` records show with no DevPul call, marked `developer.log` in the Source filter, with `package:logging`'s level names (`fine`, `info`, `warning`, `severe` and so on). The VM cuts messages at 128 characters; opening the row reads the full message, error and stack trace from the app.

## Errors

```dart
try {
  await sync();
} catch (e, s) {
  Devpul.error(e, s, source: 'sync');
}
```

`source` groups errors in the UI. `library`, `context`, `information`, `widget` and `location` add detail; `silent: true` marks errors that are expected noise. `DevpulFlutter.install()` reports Flutter and uncaught errors for you.

Each error also carries `route`, the result of `Devpul.route`, a function that returns the screen the app shows. `DevpulNavigatorObserver` sets it unless the app already has.

## Actions

```dart
Devpul.action('Clear cache', (_) => cache.clear());
```

Each action becomes an item in the UI's **Actions** menu and runs in the app when clicked. Params open a form first. See [Actions](/docs/actions/).

## Handlers

```dart
Devpul.handle('cart.items', (_) => cart.items);
Devpul.handle(
  'cart.remove',
  (args) => cart.remove(args['sku']! as String),
  writes: true,
);
```

A handler answers `context.request(name, args)` from a [plugin](/docs/plugins/#talking-to-the-app). `args` holds the JSON object the plugin sent, empty when it sent none; the return value is converted like event data, and exceptions reach the plugin as the failure message. Name it `<plugin id>.<method>`. Registering a name again replaces it.

A `writes: true` handler refuses unless Allow writes is on in the UI's Plugins tab. Give it to every handler that changes the app.

## Limits

```dart
Devpul.limit('frame', 0); // mute
Devpul.limit('route', 20); // at most 20 per second
Devpul.limit('route', null); // no cap
```

A limit covers the kind and its dotted children: `http` covers `http.request`. Events over the cap are dropped in the app before they are converted or kept in the backlog. `app.*` kinds are never limited. Settings in the UI lists each kind with its limit and drop count, and sets them on a connected app.

## Configuration

```dart
Devpul.configure(
  DevpulConfig(
    console: ConsoleMode.verbose,
    ignoreUrls: [RegExp(r'/health$'), 'analytics.example.com'],
    ignoreMethods: {'OPTIONS'},
  ),
);
```

| Option                        | Default   |                                                                                                                                                                                                 |
| ----------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                     | `true`    | Builds without `Devpul.included` never emit either way.                                                                                                                                         |
| `console`                     | `summary` | `off`, `summary` (one line per call, `#12 < 200 GET https://example.com/items 143ms`) or `verbose` (headers and bodies).                                                                        |
| `ansiColors`                  | `null`    | Colored console lines. `null` colors them except on the iOS simulator (with `DevpulFlutter.install`), whose log stream reaches the IDE with the escape codes as text.                           |
| `uiUrl`                       | this site | The app prints `<uiUrl>#connect=<VM service URL>`; see [the printed link](/docs/connecting/#the-printed-link). `null` prints nothing; so does `console: off`. `devpul run` sets its own server. |
| `maxValueLength`              | 1048576   | Characters of JSON per event field. Longer fields become a truncation marker with a preview.                                                                                                    |
| `backlogSize`                 | 16777216  | Characters of JSON kept in app memory per isolate, oldest dropped first, and served to the UI on connect.                                                                                       |
| `ignoreUrls`, `ignoreMethods` | none      | Calls that are not reported. A string matches as a substring.                                                                                                                                   |
| `redactHeaders`, `redactBody` | none      | See below.                                                                                                                                                                                      |
| `idGenerator`                 | counter   | Request ids. The default counts per isolate.                                                                                                                                                    |

Configuration is per isolate. Set it again in a long-lived background isolate if you need the same rules there; see [Limits](/docs/limits/#one-isolate-at-a-time).

## Profile builds

Profile builds leave DevPul out unless built with `--dart-define=DEVPUL_PROFILE=true`, which `devpul run --profile` adds. Core, adapters and plugins then run as in debug, over the profile build's VM service. Events are encoded on the app's isolate, about 0.1 ms for a 2 KB event in a Linux profile build, so mute busy kinds with [limits](#limits) while measuring. Web profile builds have no VM service and leave DevPul out with or without the define.

`Devpul.included` is the constant behind this: true in debug builds and in native profile builds that opt in. Code behind it is left out of every other build:

```dart
if (Devpul.included) Bloc.observer = MyObserver();
```

## Redaction

Redaction is opt-in: by default you see what is sent and received. Redactors apply to events, curl commands and console output.

```dart
Devpul.configure(
  DevpulConfig(
    redactHeaders: (url, headers) => {
      for (final e in headers.entries)
        e.key: e.key.toLowerCase() == 'authorization' ? '***' : e.value,
    },
    redactBody: (url, body) =>
        url.path.endsWith('/login') ? '<hidden>' : body,
  ),
);
```

## HTTP adapters

`DevpulHttp` pairs requests with responses, applies ignore rules and redaction, builds curl commands and prints console lines. [Writing an HTTP adapter](/docs/adapters/) shows how to use it for any client.
