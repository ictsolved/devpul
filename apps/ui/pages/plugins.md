---
title: Writing plugins
description: Write a DevPul plugin, an ES module that adds a tab for your own event kinds, renders events or the whole tab, and calls into the app. Develop it with devpul create and publish it with a git tag.
---

# Writing plugins

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

A plugin folder with a `plugin.json` is copied into the app and registered by a generated file; [Plugin format](%ROOT%docs/plugins/format/) has the layout and [Installing plugins](%ROOT%docs/plugins/install/) the commands. `devpul add <id>` takes one listed on the [plugins page](%ROOT%plugins/).

A Dart package can also offer its plugin itself with `Devpul.plugin`, usually from the code that also sends its events:

```dart
const _plugin = r'''
export default { api: 1, id: 'cart', label: 'Cart', kinds: ['cart.updated'] };
''';

void installCartTab() => Devpul.plugin(
  'cart',
  () => _plugin,
  version: '1.0.0',
  origin: 'my_cart',
  description: 'Cart contents and totals.',
);
```

The first argument is the plugin id. `origin` says where the plugin comes from, such as a package name or git URL, and `description` what it shows, in one line. When an app offers a plugin, DevPul shows the id, version, description and size of the source in the Plugins tab and above the other tabs, and runs it only after you allow it. An approval covers one id at one hash, so a changed plugin asks again. Approved sources are kept in the browser, so a plugin loads before the app is asked for anything, and with stored or opened sessions when the app is gone. The handshake carries each source's SHA-256; when it matches an approved source DevPul keeps, the app is not asked for the source at all. That hash only picks among sources you already allowed for the id; a source the app sends is hashed by DevPul itself. The Plugins tab lists approvals with icon, id, version, description and a link to an http(s) source; hovering shows the origin on the id and the hash on the version. Switch one off to stop loading it, or remove it. Check for updates there fetches the registry's `registry.json`, only on that click, and shows the latest version of each plugin listed with the same id and source, with the `devpul upgrade` command. Other plugins show "Can't check"; `devpul outdated` in the app checks every source. Sources larger than 512 KB are refused.

The source is read only when the UI asks, and only in debug builds.

## API

| Field       | Type                                           |                                                                                                                                    |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `api`       | `1`                                            | The plugin API it was written for. A UI with another API refuses it with a message.                                                |
| `id`        | string                                         | Unique. Registering the same id again replaces the plugin.                                                                         |
| `label`     | string                                         | Tab name, up to 32 characters; a longer one fails to load.                                                                         |
| `icon`      | string                                         | Optional. SVG markup shown in the tab; `stroke="currentColor"` follows the theme. Defaults to the module's `icon` export.          |
| `kinds`     | string[] or `(kind) => boolean`                | Optional. Event kinds the tab takes. Claimed kinds leave the Events tab.                                                           |
| `summarize` | `(event) => string`                            | Optional. One line in the list.                                                                                                    |
| `render`    | `(el, event, context) => void \| (() => void)` | Optional. Fills `el` for the selected event. May return a cleanup function. Without it, the detail shows the event as a JSON tree. |
| `renderTab` | `(el, context) => void \| (() => void)`        | Optional. Fills the whole tab in place of the event list. May return a cleanup function.                                           |

An event is `{key, kind, data, tags, ts, session, run}`. `data` holds the fields the app sent. `run` identifies one launch or hot restart of one app.

Within API 1 the UI only adds: optional plugin fields and context members. A module written for API 1 keeps loading, and DevPul's CI fails any change to these types that would break one. A member added later is missing in an older UI, so check for it before calling it. A breaking change gets a new `api` number.

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
| `context.request(name, args)`  | Calls a [`Devpul.handle`](%ROOT%docs/api/#handlers) handler on the app `context.call` reaches and returns its result. Rejects with the app's message, such as a `writes` handler refusing while Allow writes is off.                                                                                                                                          |
| `context.writes`               | Whether Allow writes is on.                                                                                                                                                                                                                                                                                                                                   |
| `context.onWritesChange(fn)`   | Calls `fn` with the new value when Allow writes changes. Returns a function that stops it; DevPul also stops it when the view is cleaned up.                                                                                                                                                                                                                  |
| `context.ui.json(value)`       | A collapsible JSON tree element.                                                                                                                                                                                                                                                                                                                              |
| `context.ui.keyValues(object)` | A two-column table element; values that are not strings show as JSON.                                                                                                                                                                                                                                                                                         |
| `context.ui.copy(text, label)` | A copy button element. `text` may be a function, read on click.                                                                                                                                                                                                                                                                                               |

`render` runs again when the selection changes. Use the page's CSS variables, such as `var(--muted-foreground)`, `var(--primary)` and `var(--border)`, and the `code` class for preformatted text, so the plugin follows the theme.

## Talking to the app

The app answers through handlers it registers with [`Devpul.handle`](%ROOT%docs/api/#handlers), named `<plugin id>.<method>`. Args and results are JSON.

```dart
Devpul.handle('flags.list', (_) => flags.toJson());
Devpul.handle('flags.set', (args) {
  flags.set(args['name']! as String, on: args['on']! as bool);
  return flags.toJson();
}, writes: true);
```

```js
renderTab(el, context) {
  const button = document.createElement('button');
  button.textContent = 'Turn on beta';
  button.onclick = async () => {
    const flags = await context.request('flags.set', { name: 'beta', on: true });
    button.textContent = `beta: ${flags.beta}`;
  };
  const sync = () => (button.disabled = !context.writes);
  sync();
  el.append(button);
  return context.onWritesChange(sync);
}
```

A handler that changes the app takes `writes: true` and runs only while **Allow writes** is on in the Plugins tab: one switch for every plugin and app, off each time DevPul loads, shown in the status bar while on. DevPul sets it on each call; a plugin cannot. It guards against slips, not against a plugin, which can already reach anything the VM service can.

`context.call` reaches any VM service method, including service extensions registered with `dart:developer`. Prefer handlers: registering one again replaces it, and writes apply to them.

For plain buttons and small forms with no custom UI, [`Devpul.action`](%ROOT%docs/api/#actions) is simpler. Actions need no switch: the click is the intent.

## Examples

- Routes, in `devpul_flutter`: [`DevpulNavigatorObserver`](%ROOT%docs/flutter/#routes) offers a tab with the navigation stack after each route event. It uses `render`.
- [Riverpod](%REPO_URL%/tree/main/plugins/riverpod) and [Bloc](%REPO_URL%/tree/main/plugins/bloc), in the repository: an observer sends every change to a tab with each provider's or bloc's current value and recent changes. They use `renderTab`, `onEvents`, a handler for the current state, and `context.ui`.
- [Files](%REPO_URL%/tree/main/plugins/files), in the repository: no events; the tab asks the app for directory listings, file bytes in chunks and deletes, through `context.request`, and shows delete only while `context.writes` is on.

## Developing a plugin

```sh
devpul create my_plugin
cd my_plugin
dart pub get
devpul --plugin . run example/main.dart
```

`create` writes a [plugin folder](%ROOT%docs/plugins/format/) with a module, Dart for the app and an example app that sends events. `--js` or `--dart` writes one half; run again on the folder, it adds a half or writes missing files back. `devpul.d.ts` holds the plugin API types, which editors check the module against through its `// @ts-check` line. For TypeScript, compile to one file and point `source` at it.

`--plugin` takes the folder, or a single module file. DevPul loads the module from the same origin and loads it again each time you save, and the example app hot reloads when you save the Dart. Load errors, and in a folder the problems `devpul check` reports, show in the status bar and the Plugins tab.

`devpul check` validates the folder the way `devpul add` and the registry do. To try the Dart half in an app, run `devpul add ../my_plugin` there; `devpul sync` copies it again after edits.

A plugin on any static server that sets CORS headers works too: add its URL under Module URLs in the Plugins tab and reload DevPul after editing. A file or URL you add yourself runs without the approval prompt.

## Publishing

A plugin is published from a git repository with a tag; there is nothing to upload.

1. Set `version` in `plugin.json`, a semantic version. A change to the Dart an app calls, such as the wiring line, is a new major version, so `devpul upgrade` does not take it without `--major-versions`.
2. Run `devpul check`.
3. Commit, tag `<id>-v<version>`, such as `cart-v1.2.0`, and push the tag.

`devpul add https://example.com/plugins.git --path cart` then takes the newest tag, and `devpul outdated` in apps sees each new one. One repository can hold several plugins, one folder each. A `plugin.json` served over https needs no git, but has no versions to choose from: apps get what it serves.

`devpul` in `plugin.json` is the range of `devpul` versions the Dart works with, such as `^1.0.0`; `requires` lists the other packages it imports, with the constraints an app must meet. `tags` are up to five words shown on the plugins page.

To list a plugin on the [plugins page](%ROOT%plugins/), so `devpul add <id>` finds it, add it to [`registry/third-party.json`](%REPO_URL%/tree/main/registry) by pull request:

```json
{ "id": "cart", "url": "https://github.com/example/devpul-plugins.git", "path": "cart" }
```

CI fetches the newest tag as `devpul add` would, runs the `devpul check` checks on it and fails the pull request on any problem. Later versions need only a new tag; the next registry build lists them. The README is shown on the plugin's page as markdown without HTML, with images as links.

## Security

A plugin installed with `devpul add` is copied into the app's repository, so its code is reviewed in diffs, and `devpul upgrade` shows the diff before writing. DevPul still asks before running its module, once per id and SHA-256.

A plugin runs with full access to the page: every event, header and body DevPul has seen, from every app. Allow only plugins from sources you trust.

The page's Content Security Policy applies to plugins: no `eval` or `new Function`, no inline event handler attributes such as `onclick="..."`, no scripts from other origins. `fetch`, websockets, `style` properties and `data:` or `blob:` images work.
