---
title: Help and FAQ
description: Troubleshooting DevPul connections and missing events, how your data stays in the browser, and answers to common questions.
---

## Troubleshooting

### The connection chip stays grey

The URL is from an earlier run; the port and token change on every full restart. Click the new [printed link](/docs/connecting/#the-printed-link) or paste the new URL, and it replaces the old one. `devpul run` hands each new run to the open tab.

### The browser asks to access apps on this device

Chrome and Firefox ask before a hosted page connects to `127.0.0.1`. Allow it once for this site. If you dismissed it, allow "Local network access" in the site settings.

### Safari does not connect

Safari blocks hosted pages from reaching `127.0.0.1`. Run [`devpul`](/docs/cli/#devpul) instead; it works in Safari.

### No link is printed

- In Flutter, the link appears once a tool is attached through DDS, a moment after startup; see [the printed link](/docs/connecting/#the-printed-link).
- It appears after the app's first DevPul call, such as `Devpul.session`.
- `uiUrl: null` or `console: ConsoleMode.off` turn it off, and Flutter web prints none.

### Connected, but nothing shows

- The app must be a debug build, or a profile build with `--dart-define=DEVPUL_PROFILE=true`. Release builds never emit.
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

Its error shows in the status bar and the Plugins tab. The module must be served with CORS headers and a JavaScript content type, and export a plugin as its default export.

## Privacy and security

DevPul runs only in your browser and sends nothing anywhere you did not ask for. A connected DevPul can run code in the app, as any debugger can, and so can the plugins you allow. [Security and privacy](/docs/security/) has the details.

## Questions

### How do I see Flutter network requests in the browser?

Add the devpul package and an HTTP adapter (devpul_dio for Dio, devpul_http for package:http), then run the app with `devpul run`, or click the DevPul link it prints in a debug run. Requests, responses and errors appear live.

### Does DevPul send my data anywhere?

No. DevPul runs entirely in your browser and reads events from your app over 127.0.0.1. Requests, headers and bodies are never sent to a server. History stays in the browser's local storage.

### Does DevPul need a proxy, certificates or a server?

No. The app posts events with `dart:developer` `postEvent`, and the browser reads them from the Dart Development Service websocket on 127.0.0.1.

### Does DevPul run in release builds?

No. Release builds have no VM service and DevPul never emits in them, so there is nothing to strip before shipping. Profile builds run it only when [built for it](/docs/api/#profile-builds).

### How is DevPul different from the Flutter DevTools network tab?

DevPul works with any HTTP client through adapters, including on Flutter web, shows errors, logs and custom events next to requests, filters by tags, fields and app runs, watches several apps at once, keeps history across reloads, exports HAR and takes plugins. Both read `dart:io` traffic with no code change; in DevPul, turn on [HTTP without an adapter](/docs/ui/#http-without-an-adapter). See [DevPul, DevTools and talker](/docs/compare/).

### Can I share what I see with a teammate?

Yes. Export a session file and they can open it in DevPul without the app, or export HAR for other tools. Exports contain everything the app sent, so redact secrets first.

### Does it work with Riverpod, Bloc or GetX?

Yes. A short `ProviderObserver` or `BlocObserver` sends every state change as an event; [Extending DevPul](/docs/extend/) has both, plus a plugin that puts them in a State tab. With GetX or anything else, call `Devpul.emit` where state changes.

### Can I trigger things in the app from DevPul?

Yes. Register [actions](/docs/actions/) with `Devpul.action` and they show in the Actions menu. Plugins call handlers the app registers with `Devpul.handle`; those that change the app wait for Allow writes in the Plugins tab.
