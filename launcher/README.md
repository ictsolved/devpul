# devpul

Serves the [DevPul](https://devpul.saradgajurel.com.np) UI on `127.0.0.1` so it runs without the hosted site. Use it in Safari, offline, or when a browser blocks hosted pages from reaching local apps.

```sh
npx devpul            # http://127.0.0.1:7171, opens the browser
npx devpul --port 9000 --no-open
```

Then paste the VM service URL your `flutter run` or `dart run --enable-vm-service` prints. Setup for the Dart and Flutter packages is in the [main README](https://github.com/ictsolved/devpul#readme).

The server binds to 127.0.0.1 only and serves the static UI build.

MIT
