---
title: Help and FAQ
description: Troubleshooting DevPul connections and missing events, how your data stays in the browser, and answers to common questions.
---

# Help and FAQ

## Troubleshooting

### The connection chip stays grey

The URL is from an earlier run; the token changes on every full restart. Paste the new URL and it replaces the old one. For a URL that survives restarts, use a [fixed port](%ROOT%docs/connecting/#fixed-port-optional).

### The browser asks to access apps on this device

Chrome and Firefox ask before a hosted page connects to `127.0.0.1`. Allow it once for this site. If you dismissed it, allow "Local network access" in the site settings.

### Safari does not connect

Safari blocks hosted pages from reaching `127.0.0.1`. Run `npx devpul` or open the downloaded HTML file instead; both work in Safari.

### Connected, but nothing shows

- The app must be a debug build. Release and profile builds never emit.
- The packages must be hooked up: `Devpul.session`, an HTTP adapter, `DevpulFlutter.install()`.
- `DevpulConfig(enabled: false)` or an `ignoreUrls` rule may hide calls.
- Check the filter box and chips; filters are remembered per tab.

### Events from before connecting are missing

On connect, DevPul fetches the app's own backlog of recent events, up to `backlogSize` (16 MB by default). Older events are gone; raise `backlogSize` if you attach late to long sessions.

### Requests stay pending

The response never reached the adapter: the call is still running, was dropped without an error, or the Dio interceptor is not last in the chain and another interceptor resolved the call. Long-lived streams stay pending by design.

### Plain Dart program stalls

Use `--enable-vm-service`, not `--observe`. `--observe` pauses isolates on exit, which stalls `Isolate.run` and Dio's background JSON decoding.

### A plugin does not load

Its error shows under the plugin URLs in Settings. The module must be served with CORS headers and a JavaScript content type, and export a plugin as its default export.

## Privacy and security

- **DevPul runs only in your browser.** The page reads events straight from your app over `127.0.0.1`. There is no DevPul server, account or analytics; the hosted site only serves the page itself.
- Events contain whatever the app sends, including tokens and personal data in headers and bodies. Use [redaction](%ROOT%docs/api/#redaction) when that matters, for example before sharing a screen or an export.
- History is stored in your browser (IndexedDB). Turn it off or clear it in Settings.
- The VM service URL token is the only access check. With `--disable-service-auth-codes`, any local process and any web page open in your browser can connect while the app runs.
- Plugins run with full access to the page. Load only code you trust.
- Release and profile builds never emit.

## Questions

### How do I see Flutter network requests in the browser?

Add the devpul package and an HTTP adapter (devpul_dio for Dio, devpul_http for package:http), run the app in debug mode and paste the VM service URL that `flutter run` prints into DevPul. Requests, responses and errors appear live.

### Does DevPul send my data anywhere?

No. DevPul runs entirely in your browser and reads events from your app over 127.0.0.1. Requests, headers and bodies are never sent to a server. History stays in the browser's local storage.

### Does DevPul need a proxy, certificates or a server?

No. The app posts events with `dart:developer` `postEvent`, and the browser reads them from the Dart Development Service websocket on 127.0.0.1.

### Does DevPul run in release builds?

No. Release and profile builds have no VM service and DevPul never emits in them, so there is nothing to strip before shipping.

### How is DevPul different from the Flutter DevTools network tab?

DevPul works with any HTTP client through adapters, including on Flutter web, shows errors, logs and custom events next to requests, filters by tags, fields and app runs, watches several apps at once, keeps history across reloads, exports HAR and takes plugins.

### Can I share what I see with a teammate?

Yes. Export a session file and they can open it in DevPul without the app, or export HAR for other tools. Exports contain everything the app sent, so redact secrets first.

### Does it work with Riverpod, Bloc or GetX?

Yes. A short `ProviderObserver` or `BlocObserver` sends every state change as an event; [Extending DevPul](%ROOT%docs/extend/) has both, plus a plugin that puts them in a State tab. With GetX or anything else, call `Devpul.emit` where state changes.

### Can I trigger things in the app from DevPul?

Yes. Register actions with `Devpul.action` and they show in the Actions menu. Plugins can call any service extension the app registers.
