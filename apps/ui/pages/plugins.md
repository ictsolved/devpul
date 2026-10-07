---
title: Plugins
description: Write a DevPul plugin, an ES module that adds a tab for your own event kinds, renders events or the whole tab, and calls into the app. Ship it in a Dart package.
---

# Plugins

A plugin adds a tab. It is a single-file ES module, plain JavaScript or TypeScript compiled to one file, with no imports. It can list some event kinds with the same filter, pause and keyboard navigation as the built-in tabs and render the selected one, or fill the whole tab itself.

Plugins run in the browser and only change how events look; the app sends events with `Devpul.emit`. [Extending DevPul](%ROOT%docs/extend/) shows the whole path.

## A minimal plugin

```js
// cart.js
export default {
  api: 1,
  id: 'cart',
  label: 'Cart',
  kinds: ['cart.updated', 'cart.cleared'],
  summarize: (e) => `${e.data.items} items, ${e.data.total}`,
  render(el, e, context) {
    el.append(context.ui.keyValues({ items: e.data.items, total: e.data.total }));
  },
};
```

The app side is plain events:

```dart
Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
```

## Shipping a plugin in a Dart package

A package offers its plugin to the UI with `Devpul.plugin`, usually from the code that also sends its events:

```dart
const _plugin = r'''
export default { api: 1, id: 'cart', label: 'Cart', kinds: ['cart.updated'] };
''';

void installCartTab() => Devpul.plugin('my_cart', () => _plugin);
```

The first argument is the package name. When an app offers a plugin, DevPul shows the package, size and SHA-256 of the source and runs it only after you allow it. Approvals are kept per package and hash, so a changed plugin asks again. Settings lists them, with Remove. Sources larger than 512 KB are refused.

The source is read only when the UI asks, and only in debug builds.

## API

| Field       | Type                                           |                                                                                                                                    |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `api`       | `1`                                            | The plugin API it was written for. A UI with another API refuses it with a message.                                                |
| `id`        | string                                         | Unique. Registering the same id again replaces the plugin.                                                                         |
| `label`     | string                                         | Tab name.                                                                                                                          |
| `icon`      | string                                         | Optional. SVG markup shown in the tab; `stroke="currentColor"` follows the theme.                                                  |
| `kinds`     | string[] or `(kind) => boolean`                | Optional. Event kinds the tab takes. Claimed kinds leave the Events tab.                                                           |
| `summarize` | `(event) => string`                            | Optional. One line in the list.                                                                                                    |
| `render`    | `(el, event, context) => void \| (() => void)` | Optional. Fills `el` for the selected event. May return a cleanup function. Without it, the detail shows the event as a JSON tree. |
| `renderTab` | `(el, context) => void \| (() => void)`        | Optional. Fills the whole tab in place of the event list. May return a cleanup function.                                           |

An event is `{key, kind, data, tags, ts, session, run}`. `data` holds the fields the app sent. `run` identifies one launch or hot restart of one app.

The module's default export is a plugin, or a function that receives `{api, register}` and registers several:

```js
export default (devpul) => {
  devpul.register({ api: 1, id: 'a', label: 'A', kinds: ['a'] });
  devpul.register({ api: 1, id: 'b', label: 'B', kinds: (k) => k.startsWith('b.') });
};
```

## Context

| Member                         |                                                                                                                                                                                                                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context.events`               | Every event the plugin matches, oldest first, current when read.                                                                                                                                                                                                           |
| `context.onEvents(fn)`         | Calls `fn` with each batch of new matching events, oldest first. Returns a function that stops it; DevPul also stops it when the view is cleaned up.                                                                                                                       |
| `context.call(method, params)` | Calls a VM service method on the app and returns the result: in `render`, the app that sent the event; in `renderTab`, the app of the newest matching event, or the app that offered the plugin. Service extensions (`ext.*`) get its isolate unless you pass `isolateId`. |
| `context.ui.json(value)`       | A collapsible JSON tree element.                                                                                                                                                                                                                                           |
| `context.ui.keyValues(object)` | A two-column table element; values that are not strings show as JSON.                                                                                                                                                                                                      |
| `context.ui.copy(text, label)` | A copy button element. `text` may be a function, read on click.                                                                                                                                                                                                            |

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

For plain buttons and small forms with no custom UI, [`Devpul.action`](%ROOT%docs/api/#actions) is simpler.

## Examples

- Routes, in `devpul_flutter`: [`DevpulNavigatorObserver`](%ROOT%docs/flutter/#routes) offers a tab with the navigation stack after each route event. It uses `render`.
- [Riverpod](%REPO_URL%/tree/main/examples/plugins/devpul_riverpod) and [Bloc](%REPO_URL%/tree/main/examples/plugins/devpul_bloc), in the repository: an observer sends every change and offers a tab with each provider's or bloc's current value and recent changes. They use `renderTab`, `onEvents`, a service extension for the current state, and `context.ui`.

## Developing a plugin

Serve the folder with any static server that sets CORS headers, then add the file's URL in Settings > Plugins:

```sh
npx http-server --cors -p 8090
# Settings > Plugins: http://127.0.0.1:8090/cart.js
```

Plugins load once per page; reload DevPul after editing. Load errors show in Settings. A URL you add yourself runs without the approval prompt.

## Security

A plugin runs with full access to the page: every event, header and body DevPul has seen, from every app. Allow only plugins from packages you trust.
