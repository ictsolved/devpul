---
title: Extending DevPul
description: Send state changes, analytics or anything else from a Dart app to DevPul, give it its own tab and act on the app, with Riverpod and Bloc observers.
---

# Extending DevPul

DevPul shows anything the app sends, not only HTTP. Extending it takes up to three pieces; only the first is required.

| Piece | Where | How |
| --- | --- | --- |
| Send | App | `Devpul.emit(kind, data)` from wherever the data appears: an observer, a listener, a wrapper. |
| Show | Browser | Events land in the Events tab with kind chips, filters and a JSON tree. A [plugin](%ROOT%docs/plugins/) gives them their own tab and view. |
| Act | Both | [`Devpul.action`](%ROOT%docs/api/#actions) adds an item to the Actions menu. A plugin can call any service extension the app registers. |

[HTTP adapters](%ROOT%docs/adapters/) are for HTTP clients only: they feed the HTTP tab. State, analytics, database calls and everything else go through `Devpul.emit`.

## Riverpod

A `ProviderObserver` sees every update, disposal and failure (Riverpod 3):

```dart
import 'package:devpul/devpul.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final class DevpulProviderObserver extends ProviderObserver {
  @override
  void didUpdateProvider(
    ProviderObserverContext context,
    Object? previousValue,
    Object? newValue,
  ) {
    Devpul.emit('riverpod.update', {
      'provider': _name(context),
      'previous': previousValue,
      'next': newValue,
    });
  }

  @override
  void didDisposeProvider(ProviderObserverContext context) {
    Devpul.emit('riverpod.dispose', {'provider': _name(context)});
  }

  @override
  void providerDidFail(
    ProviderObserverContext context,
    Object error,
    StackTrace stackTrace,
  ) {
    Devpul.error(error, stackTrace,
        source: 'riverpod', context: _name(context));
  }

  String _name(ProviderObserverContext context) =>
      context.provider.name ?? context.provider.runtimeType.toString();
}
```

```dart
runApp(ProviderScope(
  observers: [DevpulProviderObserver()],
  child: const MyApp(),
));
```

Generated providers carry their name; give others a `name:` so events say which provider changed.

## Bloc

A `BlocObserver` sees events, state changes and errors of every Bloc and Cubit:

```dart
import 'package:devpul/devpul.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class DevpulBlocObserver extends BlocObserver {
  @override
  void onEvent(Bloc<dynamic, dynamic> bloc, Object? event) {
    super.onEvent(bloc, event);
    Devpul.emit('bloc.event', {'bloc': '${bloc.runtimeType}', 'event': event});
  }

  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    Devpul.emit('bloc.change', {
      'bloc': '${bloc.runtimeType}',
      'previous': change.currentState,
      'next': change.nextState,
    });
  }

  @override
  void onError(BlocBase<dynamic> bloc, Object error, StackTrace stackTrace) {
    Devpul.error(error, stackTrace,
        source: 'bloc', context: '${bloc.runtimeType}');
    super.onError(bloc, error, stackTrace);
  }
}
```

```dart
void main() {
  Bloc.observer = DevpulBlocObserver();
  runApp(const MyApp());
}
```

## State values

Values go through the same conversion as every event: maps, lists, strings, numbers, booleans, `DateTime` and `Uri` stay as they are, and other objects become their `toString()`. States from `freezed`, or `equatable` with `stringify`, read well that way. For a JSON tree, send `state.toJson()` where states have it.

Each field is capped at [`maxValueLength`](%ROOT%docs/api/#configuration). Skip providers or blocs that change on every frame in the observer itself.

## Other sources

The same one line works anywhere the app has a hook:

```dart
Devpul.emit('analytics.event', {'name': name, 'params': params});
Devpul.emit('ws.message', {'direction': 'in', 'data': message});
Devpul.emit('db.query', {'sql': sql, 'args': args, 'ms': elapsed});
Devpul.emit('flags.changed', flags.toJson());
```

Dotted kinds group into families: `kind:ws` in the filter, or the kind chips, narrow Events to them.

## A tab for state

This plugin moves Riverpod and Bloc events out of Events into a State tab, showing the event, previous and next values for each:

```js
// state.js
export default {
  id: 'state',
  label: 'State',
  kinds: (k) => k.startsWith('riverpod.') || k.startsWith('bloc.'),
  summarize: (e) => `${e.data.provider ?? e.data.bloc}  ${e.kind.split('.')[1]}`,
  render(el, e) {
    for (const key of ['event', 'previous', 'next']) {
      if (!(key in e.data)) continue;
      const pre = document.createElement('pre');
      pre.className = 'code';
      pre.textContent = `${key}: ${JSON.stringify(e.data[key], null, 2)}`;
      el.append(pre);
    }
  },
};
```

Serve it and add its URL in Settings > Plugins, as described in [Plugins](%ROOT%docs/plugins/#developing-a-plugin).

## Acting on the app

Actions need a handle on what they change. With Riverpod, create the container yourself:

```dart
final container = ProviderContainer(observers: [DevpulProviderObserver()]);
Devpul.action('Reset cart', () => container.invalidate(cartProvider));
runApp(UncontrolledProviderScope(container: container, child: const MyApp()));
```

For controls inside a plugin tab, such as editing a value in place, register a service extension and call it with `context.call`. See [Talking to the app](%ROOT%docs/plugins/#talking-to-the-app).
