---
title: Plugins
description: Write a DevPul plugin, an ES module that adds a tab for your own event kinds, can render each event and call into the app.
---

# Plugins

A plugin adds a tab for some event kinds. It is an ES module served from a URL: add the URL in Settings > Plugins and the tab appears. The tab lists the plugin's events with the same filter, pause and keyboard navigation as the built-in tabs, and the plugin decides what the list says and what the detail pane shows.

## A minimal plugin

```js
// cart.js
export default {
  id: 'cart',
  label: 'Cart',
  kinds: ['cart.updated', 'cart.cleared'],
  summarize: (e) => `${e.data.items} items, ${e.data.total}`,
  render(el, e) {
    el.textContent = `Total: ${e.data.total}`;
  },
};
```

The app side is plain events:

```dart
Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
```

## API

| Field | Type | |
| --- | --- | --- |
| `id` | string | Unique. Registering the same id again replaces the plugin. |
| `label` | string | Tab name. |
| `kinds` | string[] or `(kind) => boolean` | Event kinds the tab takes. Claimed kinds leave the Events tab. |
| `summarize` | `(event) => string` | Optional. One line in the list. |
| `render` | `(el, event, context) => void \| (() => void)` | Optional. Fills `el` for the selected event. May return a cleanup function. Without it, the detail shows the event as a JSON tree. |

An event is `{key, kind, data, ts, session, run}`. `data` holds the fields the app sent plus the envelope (`v`, `session`, `seq`, `ts`, `tags`). `run` identifies one launch or hot restart of one app.

`context` gives:

| Member | |
| --- | --- |
| `context.events` | Every event the plugin matches, oldest first. Read it in `render`; it is current at the time you read it. |
| `context.call(method, params)` | Calls a VM service method on the app that sent the event and returns the result. Service extensions (`ext.*`) get the event's isolate unless you pass `isolateId`. |

`render` runs again when the selection changes. Use the page's CSS variables, such as `var(--muted)`, `var(--accent)` and `var(--border)`, and the `code` class for preformatted text, so the plugin follows the theme.

## Talking to the app

`context.call` reaches any service extension the app registers with `dart:developer`:

```dart
registerExtension('ext.myapp.flags', (method, params) async {
  if (params['set'] != null) flags.toggle(params['set']!);
  return ServiceExtensionResponse.result(jsonEncode(flags.toJson()));
});
```

```js
render(el, e, context) {
  const button = document.createElement('button');
  button.textContent = 'Toggle beta';
  button.onclick = async () => {
    const flags = await context.call('ext.myapp.flags', { set: 'beta' });
    button.textContent = `beta: ${flags.beta}`;
  };
  el.append(button);
}
```

For plain buttons with no custom UI, [`Devpul.action`](%ROOT%docs/api/#actions) is simpler.

## Example: Routes

DevPul serves one example, a plugin that shows the navigation stack after each event from [`DevpulNavigatorObserver`](%ROOT%docs/flutter/#routes). Add this URL in Settings > Plugins:

```text
%SITE_URL%plugins/routes.js
```

The [source](%REPO_URL%/blob/main/app/public/plugins/routes.js) is a good starting point.

## Other module shapes

The default export can be one plugin, a list of plugins, or a function that receives the API and registers plugins itself:

```js
export default (devpul) => {
  devpul.register({ id: 'a', label: 'A', kinds: ['a'] });
  devpul.register({ id: 'b', label: 'B', kinds: (k) => k.startsWith('b.') });
};
```

The same API is on `window.devpul` (`{version, register}`), so you can try a plugin from the browser console. `version` is 2.

## Developing a plugin

Serve the folder with any static server that sets CORS headers, then add the file's URL in Settings:

```sh
npx http-server --cors -p 8090
# Settings > Plugins: http://127.0.0.1:8090/cart.js
```

Plugins load once per page; reload DevPul after editing. Load errors show under the plugin URLs in Settings.

## Security

A plugin runs with full access to the page: every event, header and body DevPul has seen. Load only code you trust, from hosts you control.
