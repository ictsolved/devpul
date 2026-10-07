# devpul_riverpod

An example of a Dart package that ships a DevPul plugin. `DevpulProviderObserver` sends every provider change to DevPul and offers a Riverpod tab with each provider's current value and recent updates.

```dart
runApp(ProviderScope(observers: [DevpulProviderObserver()], child: const MyApp()));
```

Not published. Copy it into your project as a starting point.
