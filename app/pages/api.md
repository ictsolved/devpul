---
title: Core API
description: Devpul.session, tags, emit, log, error, action and DevpulConfig in the devpul Dart package, with redaction and ignore rules.
---

# Core API

Everything here is in `package:devpul/devpul.dart`. Calls are no-ops in release and profile builds and when `enabled` is false, and they never throw into your app.

## Session

```dart
Devpul.session(
  {'name': 'Shop', 'version': '2.3.1', 'env': 'staging', 'baseUrl': 'https://api.example.com'},
  tags: {'env': 'staging'},
);
```

Fields are free-form and show in the header; pick which ones in Settings. `name` labels the app in connection chips and run dividers. The session is sent again when DevPul connects late, so it is never missing.

## Tags

```dart
Devpul.tags['user'] = 'guest';
```

Tags are added to every event from then on and become filter chips and `tag:` filters. Values are strings.

## Custom events

```dart
Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
```

Any JSON-like value works; other objects become their `toString()`. Kinds that no plugin claims show in Events. Prefer dotted names, such as `cart.updated`, so `kind:cart` finds the family.

## Logs

```dart
Devpul.log('Signed in', name: 'auth');
Devpul.log('Retrying', level: 'warn', name: 'sync');
Devpul.log('Sync failed', level: 'error', name: 'sync', error: e, stack: s);
```

`level` is free-form; `debug`, `info`, `warn` and `error` get colors. To forward `package:logging`:

```dart
Logger.root.onRecord.listen((r) => Devpul.log(
      r.message,
      level: r.level.name.toLowerCase(),
      name: r.loggerName,
      error: r.error,
      stack: r.stackTrace,
    ));
```

In Flutter, `DevpulFlutter.captureDebugPrint()` sends `debugPrint` output too.

## Errors

```dart
try {
  await sync();
} catch (e, s) {
  Devpul.error(e, s, source: 'sync');
}
```

`source` groups errors in the UI. `library`, `context` and `information` add detail; `silent: true` marks errors that are expected noise. `DevpulFlutter.install()` reports Flutter and uncaught errors for you.

## Actions

```dart
Devpul.action('Clear cache', () async {
  final n = await cache.clear();
  return 'removed $n entries';
});
Devpul.action('Sign out', () => auth.signOut());
```

Each action becomes an item in the UI's **Actions** menu. It runs in the app when clicked, and the return value, if any, shows as text. Exceptions show as the failure message. Registering a name again replaces it.

Actions are debug tools: keep them to things that are safe to trigger at any time.

## Configuration

```dart
Devpul.configure(DevpulConfig(
  console: ConsoleMode.verbose,
  ignoreUrls: [RegExp(r'/health$'), 'analytics.example.com'],
  ignoreMethods: {'OPTIONS'},
));
```

| Option | Default | |
| --- | --- | --- |
| `enabled` | `true` | Release and profile builds never emit either way. |
| `console` | `summary` | `off`, `summary` (one line per call, `#12 < 200 GET https://example.com/items 143ms`) or `verbose` (headers and bodies). |
| `ansiColors` | `true` | Colored console lines. |
| `maxValueLength` | 1 MB | Longer event fields become a truncation marker with a preview. |
| `backlogSize` | 16 MB | Events kept in app memory per isolate and served to the UI on connect. |
| `ignoreUrls`, `ignoreMethods` | none | Calls that are not reported. A string matches as a substring. |
| `redactHeaders`, `redactBody` | none | See below. |
| `idGenerator` | counter | Request ids. |

Configuration is per isolate. Set it again in a long-lived background isolate if you need the same rules there.

## Redaction

Redaction is opt-in: by default you see what is sent and received. Redactors apply to events, curl commands and console output.

```dart
Devpul.configure(DevpulConfig(
  redactHeaders: (url, headers) => {
    for (final e in headers.entries)
      e.key: e.key.toLowerCase() == 'authorization' ? '***' : e.value,
  },
  redactBody: (url, body) => url.path.endsWith('/login') ? '<hidden>' : body,
));
```

## HTTP adapters

`DevpulHttp` pairs requests with responses, applies ignore rules and redaction, builds curl commands and prints console lines. [Writing an HTTP adapter](%ROOT%docs/adapters/) shows how to use it for any client.
