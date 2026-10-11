---
title: Actions
description: Run code in a Dart or Flutter app from DevPul's Actions menu with Devpul.action, with typed params, results and Riverpod or Bloc examples.
---

An action is a function in the app with a name. It shows in the **Actions** menu of the UI and runs in the app when clicked: clear a cache, sign out, seed test data, flip a flag.

```dart
Devpul.action('Clear cache', (_) async {
  final n = await cache.clear();
  return 'removed $n entries';
});
```

Register actions once, at startup or where the object they act on is created. Registering a name again replaces the action; the menu lists them in registration order.

## Params

Params open a form before the action runs:

```dart
Devpul.action(
  'Seed cart',
  (args) => cart.seed(args['items']! as num, clear: args['clear']! as bool),
  params: const [
    DevpulParam.number('items', initial: 3),
    DevpulParam.flag('clear'),
  ],
);
Devpul.action(
  'Sign in as',
  (args) => auth.signInAs(args['role']! as String),
  params: const [
    DevpulParam.choice('role', ['guest', 'member', 'admin']),
  ],
);
```

| Param                                    | Field    | Value in `args`                        |
| ---------------------------------------- | -------- | -------------------------------------- |
| `DevpulParam.text(name, initial: '')`    | Text     | `String`                               |
| `DevpulParam.number(name, initial: 0)`   | Number   | `num`                                  |
| `DevpulParam.flag(name, initial: false)` | Checkbox | `bool`                                 |
| `DevpulParam.choice(name, options)`      | Select   | One of `options`, the first by default |

`args` holds every param by name; a value the UI did not send takes its `initial`. Actions without params get an empty map.

## Results

The return value, awaited when it is a `Future`, shows in the status bar: a string as is, other values as JSON, nothing as "done". An exception shows as the failure message. Return something short.

## In the UI

The **Actions** menu sits with the toolbar controls once a connected app registers one. With several apps connected, it groups actions by app. Items are disabled while their app is paused in the debugger, since it would run them only on resume.

Actions are debug tools: keep them to things that are safe to trigger at any time. They exist only in builds with [`Devpul.included`](/docs/api/#profile-builds); in other builds `Devpul.action` does nothing.

## State management

An action needs a handle on what it changes. With Riverpod, create the container yourself:

```dart
final container = ProviderContainer(observers: [DevpulProviderObserver()]);
Devpul.action('Reset cart', (_) => container.invalidate(cartProvider));
runApp(UncontrolledProviderScope(container: container, child: const MyApp()));
```

With Bloc, register the action where the bloc is created:

```dart
class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) {
        final bloc = CartBloc();
        Devpul.action('Empty cart', (_) => bloc.add(CartCleared()));
        return bloc;
      },
      child: const CartPage(),
    );
  }
}
```

## Actions or handlers

[Handlers](/docs/api/#handlers) answer calls from a plugin tab, with any JSON in and out, for custom controls such as editing a value in place. A handler that changes the app runs only while Allow writes is on. An action needs no switch, since the click is the intent. Use actions for buttons and small forms, handlers when a [plugin](/docs/plugins/#talking-to-the-app) draws the UI.
