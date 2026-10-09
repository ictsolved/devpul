## 1.0.0-dev.1

- Requires Dart 3.8.
- Events carry their fields in `data`: `{v, session, seq, ts, tags?, data}`. The UI asks apps on older versions to update.
- Removed `Devpul.sessionId` and `Devpul.schemaVersion`.
- The app prints a link that opens the UI connected to it. `DevpulConfig.uiUrl` sets the page, `null` turns it off.
- Ships the UI as a DevTools extension.
- `ext.devpul.info` handshake with the protocol version, actions, plugins and limits; `app.info` events replace `app.actions`.
- `Devpul.action` takes `params` (`DevpulParam.text`, `number`, `flag`, `choice`); the callback receives their values.
- `Devpul.limit` mutes or rate-limits a kind; the UI can set limits through `ext.devpul.limit`.
- `Devpul.plugin` offers a browser plugin to the UI; the handshake lists the SHA-256 of its source.

## 0.2.0

- `Devpul.log` for the Logs tab.
- `Devpul.action` adds buttons to the UI's Actions menu that run code in the app.
- `Devpul.error` takes `information` and `silent`.
- `DevpulHttpCall.response` takes `finalUrl`.
- The backlog always includes the latest session and actions.

## 0.1.0

- Initial release.
