## 1.0.0-dev.1

- Requires Dart 3.8.
- Events carry their fields in `data`: `{v, session, seq, ts, tags?, data}`. The UI asks apps on older versions to update.
- Removed `Devpul.sessionId` and `Devpul.schemaVersion`.

## 0.2.0

- `Devpul.log` for the Logs tab.
- `Devpul.action` adds buttons to the UI's Actions menu that run code in the app.
- `Devpul.error` takes `information` and `silent`.
- `DevpulHttpCall.response` takes `finalUrl`.
- The backlog always includes the latest session and actions.

## 0.1.0

- Initial release.
