---
title: Plugin API
description: Reference for the DevPul plugin API - the module's default export, plugin fields, the event shape, the context with events, VM service calls and handlers, UI helpers, styling and the Content Security Policy.
---

A plugin is one ES module with a default export and no imports, plain JavaScript or TypeScript compiled to one file. [Writing plugins](/docs/plugins/) walks through building one. The types are in `devpul.d.ts`, which [`devpul create`](/docs/cli/#create) writes next to the module.

## Module

The default export is a plugin:

```js
export default { api: 1, id: 'cart', label: 'Cart', kinds: ['cart.updated'] };
```

Or a function that receives `{api, register}` and registers several:

```js
export default (devpul) => {
  devpul.register({ api: 1, id: 'a', label: 'A', kinds: ['a'] });
  devpul.register({ api: 1, id: 'b', label: 'B', kinds: (k) => k.startsWith('b.') });
};
```

A module may also export `icon`, SVG markup used by each of its plugins that sets none. In a plugin folder, `devpul` adds it from the icon file.

## Plugin

| Field       | Type                                           |                                                                                                                                          |
| ----------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `api`       | `1`                                            | The plugin API it was written for. A UI with another API refuses it with a message.                                                      |
| `id`        | string                                         | Unique. Registering the same id again replaces the plugin.                                                                               |
| `label`     | string                                         | Tab name, up to 32 characters; a longer one fails to load.                                                                               |
| `icon`      | string                                         | Optional. SVG markup shown in the tab; `stroke="currentColor"` follows the theme. Defaults to the module's `icon` export.                |
| `kinds`     | string[] or `(kind) => boolean`                | Optional. Event kinds the tab takes. Claimed kinds leave the Events tab.                                                                 |
| `summarize` | `(event) => string`                            | Optional. One line in the list.                                                                                                          |
| `render`    | `(el, event, context) => void \| (() => void)` | Optional. Fills `el` for the selected event. May return a cleanup function. Without it, the detail shows the event as JSON, tree or raw. |
| `renderTab` | `(el, context) => void \| (() => void)`        | Optional. Fills the whole tab in place of the event list. May return a cleanup function.                                                 |

## Event

An event is `{key, kind, data, tags, ts, session, run}`. `data` holds the fields the app sent. `run` identifies one launch or hot restart of one app.

## Context

`render` and `renderTab` receive the context.

| Member                         |                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `context.events`               | Every event the plugin matches, oldest first, current when read.                                                                                                                                                                                                                                                                                              |
| `context.onEvents(fn)`         | Calls `fn` with each batch of new matching events, oldest first. Returns a function that stops it; DevPul also stops it when the view is cleaned up.                                                                                                                                                                                                          |
| `context.call(method, params)` | Calls a VM service method on the app and returns the result: in `render`, the app that sent the event; in `renderTab`, the app of the newest matching event, or the app that offered the plugin. Service extensions (`ext.*`) get its isolate unless you pass `isolateId`. They fail while the app is paused in the debugger and after 5 s without an answer. |
| `context.request(name, args)`  | Calls a [`Devpul.handle`](/docs/api/#handlers) handler on the app `context.call` reaches and returns its result. Rejects with the app's message, such as a `writes` handler refusing while Allow writes is off.                                                                                                                                               |
| `context.writes`               | Whether Allow writes is on.                                                                                                                                                                                                                                                                                                                                   |
| `context.onWritesChange(fn)`   | Calls `fn` with the new value when Allow writes changes. Returns a function that stops it; DevPul also stops it when the view is cleaned up.                                                                                                                                                                                                                  |
| `context.requests`             | HTTP calls that events the plugin matches started, oldest first: `{key, event, method, url, status?, state, ts}`, where `event` is the key of the event and `state` is `pending`, `paused`, `done` or `error`. DevPul 1.0 has none of the three request members; check before use.                                                                            |
| `context.onRequests(fn)`       | Calls `fn` with each batch of those calls that are new or changed. Returns a function that stops it; DevPul also stops it when the view is cleaned up.                                                                                                                                                                                                        |
| `context.openRequest(key)`     | Opens a call from `context.requests` in the HTTP tab; **Back** returns to the plugin.                                                                                                                                                                                                                                                                         |
| `context.ui.json(value)`       | A collapsible JSON tree element, with the value hints and menu of the UI's own trees.                                                                                                                                                                                                                                                                         |
| `context.ui.keyValues(object)` | A two-column table element, with value hints and menu; values that are not strings show as JSON.                                                                                                                                                                                                                                                              |
| `context.ui.copy(text, label)` | A copy button element. `text` may be a function, read on click.                                                                                                                                                                                                                                                                                               |

`render` runs again when the selection changes, after the cleanup of the previous call.

## Styling

Use the page's CSS variables, such as `var(--muted-foreground)`, `var(--primary)` and `var(--border)`, and the `code` class for preformatted text, so the plugin follows the theme.

## Content Security Policy

The page's Content Security Policy applies to plugins: no `eval` or `new Function`, no inline event handler attributes such as `onclick="..."`, no scripts from other origins. `fetch`, websockets, `style` properties and `data:` or `blob:` images work.

## Versioning

Within API 1 the UI only adds: optional plugin fields and context members. A module written for API 1 keeps loading, and DevPul's CI fails any change to these types that would break one. A member added later is missing in an older UI, so check for it before calling it. A breaking change gets a new `api` number.
