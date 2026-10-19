---
title: Agents (MCP)
description: devpul mcp gives coding agents such as Claude Code, Copilot in VS Code, Cursor and Gemini CLI what DevPul records in the running app - requests with bodies, logs, errors with the steps before them, events - the app's actions and its plugins' state, over MCP.
---

`devpul mcp` is an [MCP](https://modelcontextprotocol.io) server on stdio. An agent reads the running app the way the DevPul UI does: requests with headers and bodies, logs, errors with the steps before them, route changes, plugin and custom events, the actions the app registers, and what its plugins show: database rows, files, router and state. It comes with [devpul_cli](/docs/cli/).

## Setup

The command is `devpul mcp`. Add it to the agent once, for all projects:

| Agent            | Setup                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Claude Code      | `claude mcp add --scope user devpul -- devpul mcp`                                                        |
| VS Code, Copilot | In `.vscode/mcp.json`: `{"servers": {"devpul": {"type": "stdio", "command": "devpul", "args": ["mcp"]}}}` |
| Cursor           | In `~/.cursor/mcp.json`: `{"mcpServers": {"devpul": {"command": "devpul", "args": ["mcp"]}}}`             |
| Gemini CLI       | `gemini mcp add --scope user devpul devpul mcp`                                                           |
| Others           | A stdio server with command `devpul` and argument `mcp`.                                                  |

`devpul` comes from the pub cache's `bin` folder. An agent started from a desktop launcher may not have it on its `PATH`; then use the command `dart` with the arguments `pub global run devpul_cli:devpul mcp`.

## Which app it reads

Without a URL, `devpul mcp` reads the app that the devpul serving the UI on port 7171 last connected to, and checks again on every tool call. So it follows each `devpul run`, and an app handed over with `devpul <vm-service-url>`:

```sh
devpul run -d macos
```

An app started from the IDE prints its VM service URL in the debug console. Pass it to the running devpul, or to `devpul mcp` itself in the agent's config:

```sh
devpul http://127.0.0.1:41234/AbCdEf12=/
devpul mcp http://127.0.0.1:41234/AbCdEf12=/
```

A fixed URL stops working when the app exits. `--port <n>` follows the devpul on another port.

### Session files

Given a session file in place of a URL, it reads that file: one the UI exported, a [bug report](/docs/ui/#bug-reports), or one [devpul_test](/docs/testing/) wrote for a failing test. `get_session` gives its `file`, and a bug report's device with its screenshot as an image; `run_action` and the plugin calls have no app to call.

```sh
devpul mcp build/devpul/test/cart_test/cart_adds_an_item.json
```

On connect it reads the app's backlog, as the UI does, then records live. Hot restarts start a new run; tools read the newest run unless given another.

## Tools

| Tool                | Returns                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_session`       | The app's session fields, devpul version, actions with their parameters, plugins with their handlers, rate limits, the runs recorded, a bug report.    |
| `list_requests`     | One line per request: id, time, method, status, duration, size, mock mode, what started it, URL. Filters: method, host, status range, state, text.     |
| `get_request`       | One request with headers and bodies of request and response, or its error, and its cause.                                                              |
| `list_errors`       | One line per error: id, time, type and message, route.                                                                                                 |
| `list_logs`         | One line per log: id, time, level, logger name, message. Filters: lowest level, logger name, text.                                                     |
| `list_events`       | Route changes, plugin events and `Devpul.emit` events. Filters: kind, text.                                                                            |
| `get_event`         | One error, log or event. An error comes with its stack, Flutter and SDK frames folded, and the routes, logs, events and requests before it in its run. |
| `run_action`        | Runs a [`Devpul.action`](/docs/actions/), as its button in the UI does.                                                                                |
| `call_plugin`       | Calls a plugin handler that only reads and returns its result.                                                                                         |
| `call_plugin_write` | Calls a plugin handler that changes the app or returns secrets and returns its result.                                                                 |

Every list takes `text`, `since` and `before` (ids) and `limit` (50 by default), and returns the newest items, oldest first; `since` pages forward from an earlier call. Strings and bodies past 20,000 characters are cut, with a note of the full length; `max_chars` raises the cut. The app's own [limits](/docs/limits/) and redaction apply before anything reaches the agent.

`run_action` takes only the actions the app lists at the time of the call. Other service extensions are not reachable.

## Plugin handlers

Plugins read the app through handlers it registers with [`Devpul.handle`](/docs/api/#handlers). `get_session` lists them under each plugin with their description and the tool that calls them; an agent calls them with JSON args, as the plugin's tab does. The first-party plugins register these; (write) marks those for `call_plugin_write`:

| Plugin         | Handlers                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------- |
| sqflite        | `sqflite.databases`, `sqflite.query` (read-only SQL); `sqflite.execute` (any statement, write)        |
| Files          | `files.roots`, `files.list`, `files.size`, `files.read`; `files.delete` (write)                       |
| go_router      | `go_router.state`; `go_router.go` (write)                                                             |
| WebSocket      | `web_socket_channel.connections`                                                                      |
| Riverpod, Bloc | `riverpod.state`, `bloc.state`                                                                        |
| Secure storage | `secure_storage.keys`; `secure_storage.read`, `secure_storage.write`, `secure_storage.delete` (write) |
| Overrides      | `overrides.state`; `overrides.set` (write), from [`DevpulApp.builder`](/docs/flutter/#overrides)      |
| devpul_flutter | `flutter.screenshot`, `flutter.device`, from [`DevpulFlutter.install()`](/docs/flutter/#bug-reports)  |

`call_plugin` runs handlers that only read. `call_plugin_write` runs `writes` handlers and `sensitive` ones, such as reading a secure storage value or navigating; each tool refuses the other's handlers. The agent asks before a tool call unless you allowed the tool or set it to approve calls on its own, as Claude Code's auto mode does, so allow `call_plugin` and keep `call_plugin_write` on ask. In Claude Code that is `"allow": ["mcp__devpul__call_plugin"]` under `permissions` in its settings. The UI's Allow writes switch does not apply: it lives in the browser tab, not in the app. Results are cut at 20,000 characters like the other tools. Data images in a result, such as `flutter.screenshot`'s, come as images the model sees.

## Next to dart mcp-server

The Dart SDK's `dart mcp-server` drives the app and the tooling: it runs and hot reloads the app, reads the widget tree and runtime errors, runs analysis, tests and pub. `devpul mcp` reads what the app recorded through DevPul: requests with bodies, logs, errors with the steps before them, state changes from plugins and your own events, and runs the app's actions. They do not overlap; add both.

## Security

`devpul mcp` speaks only on stdio and opens no port. It connects to the app's VM service and to the devpul on `127.0.0.1`.

What the tools return goes to the agent and from there to its model provider. That includes request and response bodies and headers the app did not [redact](/docs/api/#redaction), and whatever plugin handlers return, such as database rows. `run_action` runs app code; `call_plugin_write` changes the app and reads secrets, so keep it on ask. See [Security](/docs/security/).
