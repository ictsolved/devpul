---
title: Security and privacy
description: What DevPul can reach in your app, how plugins are trusted, why connect links reach only this machine, and what DevPul sends over the network - nothing without a click.
---

## VM service access is code execution

DevPul talks to the app through the VM service, the same debug protocol IDEs and DevTools use. Whoever holds a VM service URL with its token can evaluate any expression in the app, reload its code and call every service extension: anything the app can do, with its files, keys and network. DevPul and its plugins have that access while connected.

- The token in the URL is the only access check. It is new on every run, and the service listens on `127.0.0.1` only.
- Treat a VM service URL like a password while the app runs. The `#connect=` link carries it in the fragment, which browsers never send to the site.
- Release builds have no VM service. Profile builds have one; DevPul stays out of them unless built with `DEVPUL_PROFILE`.

## Data stays in the browser

- The page reads events straight from the app over `127.0.0.1`. There is no DevPul server, account or analytics; the hosted site only serves the page.
- Events contain whatever the app sends, including tokens and personal data in headers and bodies. Use [redaction](/docs/api/#redaction) when that matters, for example before sharing a screen or an export.
- Rows from [HTTP without an adapter](/docs/ui/#http-without-an-adapter) hold what dart:io recorded; the app's redaction does not apply to them.
- History is stored in the browser (IndexedDB). Turn it off or clear it in Settings.
- Exports, HAR and session files, hold everything the app sent. Redact before sharing them.

## Agents read what the app sent

[`devpul mcp`](/docs/mcp/) gives an agent the same events the page shows. Its tool results go to the agent's model provider, bodies and unredacted headers included. `run_action` runs the app's actions, which are app code; `call_plugin` runs plugin handlers that only read, and `call_plugin_write` those that change the app or return secrets, which agents ask before calling unless you allowed the tool. Nothing else in the app is callable. The server talks over stdio and opens no port.

## No telemetry

DevPul makes no network request you did not ask for.

| From         | Requests                                                                                                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The page     | The app's VM service; `registry.json` on the site, only when you click Check for updates in the Plugins tab; module URLs you add yourself.                                                  |
| `devpul`     | None when serving. `add`, `outdated` and `upgrade` fetch the plugin sources you name and the registry, `outdated` also asks pub.dev for the `devpul_cli` version, `update` runs `dart pub`. |
| `devpul mcp` | None. It reads the app's VM service and asks the devpul on `127.0.0.1` for the app's URL.                                                                                                   |
| The app      | None. The packages post events on the VM service and print the connect link.                                                                                                                |
| These docs   | The site's own files. No third-party scripts, fonts or images.                                                                                                                              |

## Connect links reach only this machine

Any web page can link to DevPul with `#connect=`, so a link connects only to `localhost`, `127.0.0.0/8` or `[::1]`, and DevPul says when it ignored one. A URL you paste can point anywhere.

`devpul` listens on `127.0.0.1` and answers only requests with a loopback `Host`, so a web page cannot reach it through a DNS name that resolves to this machine. A second devpul hands over its app with a per-process token kept in the user cache directory.

## Plugins

A plugin's module runs in the DevPul page with full access to it: every event, header and body DevPul has seen, from every app, and the VM service of each connected app.

- `devpul add` copies a plugin's code into the app's repository, so it is reviewed in diffs like any other code; `devpul upgrade` shows the diff before writing.
- DevPul asks before running each plugin an app offers, once per id and SHA-256 of its source. A changed source asks again. DevPul hashes the source it receives itself.
- Module files and URLs you add yourself in the Plugins tab, or serve with `devpul --plugin`, run without asking.
- **Allow writes** in the Plugins tab gates plugin calls to handlers that change the app. It is off each time DevPul loads and guards against slips, not against a plugin: a plugin you allowed can reach anything the VM service can.

Allow only plugins from sources you trust.

## Content Security Policy

Every page, the app and the docs, sets a Content Security Policy: scripts come only from DevPul itself and the plugins you allowed, with no `eval`, no inline event handlers and no scripts from other origins. Plugins work within it; see [Plugin API](/docs/plugins/api/#content-security-policy).
