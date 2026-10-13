---
title: Agents (MCP)
description: devpul mcp gives coding agents such as Claude Code, Copilot in VS Code, Cursor and Gemini CLI what DevPul records in the running app - requests with bodies, logs, errors with the steps before them, events - and the app's actions, over MCP.
---

`devpul mcp` is an [MCP](https://modelcontextprotocol.io) server on stdio. An agent reads the running app the way the DevPul UI does: requests with headers and bodies, logs, errors with the steps before them, route changes, plugin and custom events, and the actions the app registers. It comes with [devpul_cli](/docs/cli/).

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

On connect it reads the app's backlog, as the UI does, then records live. Hot restarts start a new run; tools read the newest run unless given another.

## Tools

| Tool            | Returns                                                                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_session`   | The app's session fields, devpul version, actions with their parameters, plugins, rate limits and the runs recorded.                                   |
| `list_requests` | One line per request: id, time, method, status, duration, size, URL. Filters: method, host, status range, state (pending, done, failed), text.         |
| `get_request`   | One request with headers and bodies of request and response, or its error.                                                                             |
| `list_errors`   | One line per error: id, time, type and message, route.                                                                                                 |
| `list_logs`     | One line per log: id, time, level, logger name, message. Filters: lowest level, logger name, text.                                                     |
| `list_events`   | Route changes, plugin events and `Devpul.emit` events. Filters: kind, text.                                                                            |
| `get_event`     | One error, log or event. An error comes with its stack, Flutter and SDK frames folded, and the routes, logs, events and requests before it in its run. |
| `run_action`    | Runs a [`Devpul.action`](/docs/actions/), as its button in the UI does.                                                                                |

Every list takes `text`, `since` and `before` (ids) and `limit` (50 by default), and returns the newest items, oldest first; `since` pages forward from an earlier call. Strings and bodies past 20,000 characters are cut, with a note of the full length; `max_chars` raises the cut. The app's own [limits](/docs/limits/) and redaction apply before anything reaches the agent.

`run_action` takes only the actions the app lists at the time of the call. Plugin handlers and other service extensions are not reachable.

## Next to dart mcp-server

The Dart SDK's `dart mcp-server` drives the app and the tooling: it runs and hot reloads the app, reads the widget tree and runtime errors, runs analysis, tests and pub. `devpul mcp` reads what the app recorded through DevPul: requests with bodies, logs, errors with the steps before them, state changes from plugins and your own events, and runs the app's actions. They do not overlap; add both.

## Security

`devpul mcp` speaks only on stdio and opens no port. It connects to the app's VM service and to the devpul on `127.0.0.1`.

What the tools return goes to the agent and from there to its model provider. That includes request and response bodies and headers the app did not [redact](/docs/api/#redaction). `run_action` runs app code. See [Security](/docs/security/).
