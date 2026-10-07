# devpul_bloc

An example of a Dart package that ships a DevPul plugin. `DevpulBlocObserver` sends every bloc and cubit event and change to DevPul and offers a Bloc tab with each bloc's current state and recent events.

```dart
Bloc.observer = DevpulBlocObserver();
```

Not published. Copy it into your project as a starting point.
