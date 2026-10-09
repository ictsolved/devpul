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

## Shipping a plugin

A plugin folder with a `plugin.json` is copied into the app and registered by a generated file; [Plugin format](%ROOT%docs/plugins/format/) has the layout.

A Dart package can also offer its plugin itself with `Devpul.plugin`, usually from the code that also sends its events:

```dart
const _plugin = r'''
export default { api: 1, id: 'cart', label: 'Cart', kinds: ['cart.updated'] };
''';

void installCartTab() =>
    Devpul.plugin('cart', () => _plugin, version: '1.0.0', origin: 'my_cart');
```

The first argument is the plugin id. `origin` says where the plugin comes from, such as a package name or git URL. When an app offers a plugin, DevPul shows the id, size and SHA-256 of the source and runs it only after you allow it. An approval covers one id at one hash, so a changed plugin asks again. Approved sources are kept in the browser, so a plugin loads before the app is asked for anything, and with stored or opened sessions when the app is gone. The handshake carries each source's SHA-256; when it matches an approved source DevPul keeps, the app is not asked for the source at all. That hash only picks among sources you already allowed for the id; a source the app sends is hashed by DevPul itself. Settings lists approvals with id, version and hash; switch one off to stop loading it, or remove it. Sources larger than 512 KB are refused.

The source is read only when the UI asks, and only in debug builds.

## API

| Field       | Type                                           |                                                                                                                                    |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `api`       | `1`                                            | The plugin API it was written for. A UI with another API refuses it with a message.                                                |
| `id`        | string                                         | Unique. Registering the same id again replaces the plugin.                                                                         |
| `label`     | string                                         | Tab name.                                                                                                                          |
| `icon`      | string                                         | Optional. SVG markup shown in the tab; `stroke="currentColor"` follows the theme. Defaults to the module's `icon` export.          |
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

| Member                         |                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context.events`               | Every event the plugin matches, oldest first, current when read.                                                                                                                                                                                                                                                                                              |
| `context.onEvents(fn)`         | Calls `fn` with each batch of new matching events, oldest first. Returns a function that stops it; DevPul also stops it when the view is cleaned up.                                                                                                                                                                                                          |
| `context.call(method, params)` | Calls a VM service method on the app and returns the result: in `render`, the app that sent the event; in `renderTab`, the app of the newest matching event, or the app that offered the plugin. Service extensions (`ext.*`) get its isolate unless you pass `isolateId`. They fail while the app is paused in the debugger and after 5 s without an answer. |
| `context.ui.json(value)`       | A collapsible JSON tree element.                                                                                                                                                                                                                                                                                                                              |
| `context.ui.keyValues(object)` | A two-column table element; values that are not strings show as JSON.                                                                                                                                                                                                                                                                                         |
| `context.ui.copy(text, label)` | A copy button element. `text` may be a function, read on click.                                                                                                                                                                                                                                                                                               |

`render` runs again when the selection changes. Use the page's CSS variables, such as `var(--muted-foreground)`, `var(--primary)` and `var(--border)`, and the `code` class for preformatted text, so the plugin follows the theme.

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
- [Riverpod](%REPO_URL%/tree/main/plugins/riverpod) and [Bloc](%REPO_URL%/tree/main/plugins/bloc), in the repository: an observer sends every change to a tab with each provider's or bloc's current value and recent changes. They use `renderTab`, `onEvents`, a service extension for the current state, and `context.ui`.

## Developing a plugin

```sh
devpul create my_plugin
cd my_plugin
dart pub get
devpul --plugin . run example/main.dart
```

`create` writes a [plugin folder](%ROOT%docs/plugins/format/) with a module, Dart for the app and an example app that sends events. `--js` or `--dart` writes one half; run again on the folder, it adds a half or writes missing files back. `devpul.d.ts` holds the plugin API types, which editors check the module against through its `// @ts-check` line. For TypeScript, compile to one file and point `source` at it.

`--plugin` takes the folder, or a single module file. DevPul loads the module from the same origin and loads it again each time you save, and the example app hot reloads when you save the Dart. Load errors, and in a folder the problems `devpul check` reports, show in Settings.

`devpul check` validates the folder the way `devpul add` and the registry do. To try the Dart half in an app, run `devpul add ../my_plugin` there; `devpul sync` copies it again after edits.

A plugin on any static server that sets CORS headers works too: add its URL in Settings > Plugins and reload DevPul after editing. A file or URL you add yourself runs without the approval prompt.

## Security

A plugin runs with full access to the page: every event, header and body DevPul has seen, from every app. Allow only plugins from sources you trust.

The page's Content Security Policy applies to plugins: no `eval` or `new Function`, no inline event handler attributes such as `onclick="..."`, no scripts from other origins. `fetch`, websockets, `style` properties and `data:` or `blob:` images work.
