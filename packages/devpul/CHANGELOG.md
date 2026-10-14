## 1.0.0-dev.1

- Requires Dart 3.8.
- Events carry their fields in `data`: `{v, session, seq, ts, tags?, data}`. The UI asks apps on older versions to update.
- Removed `Devpul.sessionId` and `Devpul.schemaVersion`.
- The app prints a link to the DevPul tab of DevTools, connected to it. `DevpulConfig.uiUrl` links another page with `#connect=`, `printLink: false` turns it off.
- Ships the UI as a DevTools extension.
- `ext.devpul.info` handshake with the protocol version, actions, plugins and limits; `app.info` events replace `app.actions`.
- `Devpul.action` takes `params` (`DevpulParam.text`, `number`, `flag`, `choice`); the callback receives their values.
- `Devpul.limit` mutes or rate-limits a kind; the UI can set limits through `ext.devpul.limit`.
- `Devpul.plugin` offers a browser plugin to the UI under its plugin id; the handshake lists its origin, description and the SHA-256 of its source.
- `Devpul.included`: true in debug builds and in native profile builds compiled with `--dart-define=DEVPUL_PROFILE=true`, false in every other build.
- `Devpul.handle` answers plugin and agent requests through `ext.devpul.call`; the handshake lists handlers with their `description`. A `writes: true` handler runs only while Allow writes is on in the UI; agents reach `writes` and `sensitive: true` handlers only through `call_plugin_write`.
- `Devpul.log` takes any object: a closure is called only when DevPul is enabled, other values log their `toString()`.
- `DevpulConfig.ansiColors` is nullable; `null` follows `Devpul.ansiColorsByDefault`.

## 0.2.0

- `Devpul.log` for the Logs tab.
- `Devpul.action` adds buttons to the UI's Actions menu that run code in the app.
- `Devpul.error` takes `information` and `silent`.
- `DevpulHttpCall.response` takes `finalUrl`.
- The backlog always includes the latest session and actions.

## 0.1.0

- Initial release.
