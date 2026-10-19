---
title: Writing plugins
description: Write a DevPul plugin, an ES module that adds a tab for your own event kinds or for parts of the app, with Dart that sends events and answers calls. Develop it with devpul create and publish it with a git tag.
---

A plugin adds a tab. It is a single-file ES module, plain JavaScript or TypeScript compiled to one file, with no imports. It can list some event kinds with the same filter, pause and keyboard navigation as the built-in tabs and render the selected one, or fill the whole tab itself. The [Plugin API](/docs/plugins/api/) has every field and context member.

Plugins run in the browser and only change how events look; the app sends events with `Devpul.emit`. [Extending DevPul](/docs/extend/) shows the whole path.

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

## Talking to the app

The app answers through handlers it registers with [`Devpul.handle`](/docs/api/#handlers), named `<plugin id>.<method>`. Args and results are JSON. Agents call the same handlers through [`devpul mcp`](/docs/mcp/#plugin-handlers); a `description` tells them what each returns and takes.

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

For plain buttons and small forms with no custom UI, [`Devpul.action`](/docs/actions/) is simpler. Actions need no switch: the click is the intent.

## Developing a plugin

```sh
devpul create my_plugin
cd my_plugin
dart pub get
devpul --plugin . run example/main.dart
```

`create` writes a [plugin folder](/docs/plugins/format/) with a module, Dart for the app and an example app that sends events. `--js` or `--dart` writes one half; run again on the folder, it adds a half or writes missing files back. `devpul.d.ts` holds the plugin API types, which editors check the module against through its `// @ts-check` line. For TypeScript, compile to one file and point `source` at it.

`--plugin` takes the folder, or a single module file. DevPul loads the module from the same origin and loads it again each time you save, and the example app hot reloads when you save the Dart. Load errors, and in a folder the problems `devpul check` reports, show in the status bar and the Plugins tab.

`devpul check` validates the folder the way `devpul add` and the registry do. To try the Dart half in an app, run `devpul add ../my_plugin` there; `devpul sync` copies it again after edits.

A plugin on any static server that sets CORS headers works too: add its URL under Plugin URLs in the Plugins tab and reload DevPul after editing. A file or URL you add yourself runs without the approval prompt.

## Shipping a plugin

A plugin folder with a `plugin.json` is copied into the app and registered by a generated file; [Plugin format](/docs/plugins/format/) has the layout and [Installing plugins](/docs/plugins/install/) the commands. `devpul add <id>` takes one listed on the [plugins page](/plugins/).

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

The first argument is the plugin id. `origin` says where the plugin comes from, such as a package name or git URL, and `description` what it shows, in one line. The app offers the plugin to the UI, which runs it only after you allow it; see [approvals](/docs/plugins/install/#approvals). The source is read only when the UI asks, and only in builds with `Devpul.included`.

## Publishing

A plugin is published from a git repository with a tag; there is nothing to upload.

1. Set `version` in `plugin.json`, a semantic version. A change to the Dart an app calls, such as the wiring line, is a new major version, so `devpul upgrade` does not take it without `--major-versions`.
2. Run `devpul check`.
3. Commit, tag `<id>-v<version>`, such as `cart-v1.2.0`, and push the tag.

`devpul add https://example.com/plugins.git --path cart` then takes the newest tag, and `devpul outdated` in apps sees each new one. One repository can hold several plugins, one folder each. A `plugin.json` served over https needs no git, but has no versions to choose from: apps get what it serves.

`devpul` in `plugin.json` is the range of `devpul` versions the Dart works with, such as `^1.0.0`; `requires` lists the other packages it imports, with the constraints an app must meet. `tags` are up to five words shown on the plugins page.

To list a plugin on the [plugins page](/plugins/), so `devpul add <id>` finds it, add it to [`registry/third-party.json`](%REPO_URL%/tree/main/registry) by pull request:

```json
{ "id": "cart", "url": "https://github.com/example/devpul-plugins.git", "path": "cart" }
```

CI fetches the newest tag as `devpul add` would, runs the `devpul check` checks on it and fails the pull request on any problem. Later versions need only a new tag; the next registry build lists them. The README is shown on the plugin's page as markdown without HTML, with images as links.

## Examples

- Routes, in `devpul_flutter`: [`DevpulNavigatorObserver`](/docs/flutter/#routes) offers a tab with the navigation stack after each route event. It uses `render`.
- Overrides, in `devpul_flutter`: [`DevpulApp.builder`](/docs/flutter/#overrides) offers a tab that overrides the text scale, brightness, locale, bold text and animations the app sees. It uses `renderTab` and `context.request`.
- [Riverpod](%REPO_URL%/tree/main/plugins/riverpod) and [Bloc](%REPO_URL%/tree/main/plugins/bloc), in the repository: an observer sends every change to a tab with each provider's or bloc's current value and recent changes. They use `renderTab`, `onEvents`, a handler for the current state, and `context.ui`.
- [Files](%REPO_URL%/tree/main/plugins/files), in the repository: no events; the tab asks the app for directory listings, file bytes in chunks and deletes, through `context.request`, and shows delete only while `context.writes` is on.
- [Secure storage](%REPO_URL%/tree/main/plugins/secure_storage), in the repository: the tab lists keys and asks for one value when the user reveals it, so secrets stay in the app until then; add, edit and delete are `writes` handlers.
- [sqflite](%REPO_URL%/tree/main/plugins/sqflite), in the repository: the app passes each database with `DevpulSqflite.add`; the tab sends SQL through a read handler, which refuses statements that write, and a `writes` handler for the rest.
- [go_router](%REPO_URL%/tree/main/plugins/go_router), in the repository: an event per location change carries the match stack; the tab asks for the route tree once and calls `go` through a handler.
- [web_socket_channel](%REPO_URL%/tree/main/plugins/web_socket_channel), in the repository: a wrapper the app puts around each channel sends an event per connect, message and close; the tab rebuilds each connection from them, asks a handler for the live ones and sends through a `writes` handler.

## Security

A plugin runs with full access to the DevPul page, and users allow it once per id and SHA-256 of its source. Keep the module free of `eval` and remote scripts, which the page's [Content Security Policy](/docs/plugins/api/#content-security-policy) blocks. See [Security](/docs/security/#plugins).
