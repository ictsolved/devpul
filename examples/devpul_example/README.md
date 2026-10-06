# devpul_example

Flutter app that uses every DevPul package against [httpbin.org](https://httpbin.org) and [JSONPlaceholder](https://jsonplaceholder.typicode.com). Every button sends something: Dio and `package:http` requests with every outcome, a redirect, a form upload, a large response, logs, route changes, custom events, Flutter and async errors, and an event from a background isolate. The Actions menu in DevPul offers "Clear token" and "Ping".

```sh
flutter run
```

Open [DevPul](https://devpul.saradgajurel.com.np) and paste the VM service URL that `flutter run` prints.
