import 'dart:async';
import 'dart:convert';

import 'package:dart_mcp/server.dart';
import 'package:stack_trace/stack_trace.dart';

import 'events.dart';
import 'store.dart';
import 'vm.dart';

const _instructions = '''
Reads what DevPul recorded in a running Dart or Flutter app: HTTP requests, logs, errors with the steps before them, route changes and custom events. List tools return one line per item, oldest first, starting with its id; get_request and get_event take that id. Tools read the newest run (launch or hot restart) unless given another from get_session. Plugins answer handlers with their current state, such as database rows or router state; get_session lists them with the tool that calls each.''';

/// The MCP server `devpul mcp` runs on stdio.
base class DevpulMcp extends MCPServer with ToolsSupport {
  DevpulMcp(super.channel, this.app, {required String version})
    : super.fromStreamChannel(
        implementation: Implementation(name: 'devpul', version: version),
        instructions: _instructions,
      ) {
    for (final (tool, run)
        in <(Tool, FutureOr<String> Function(Map<String, Object?>))>[
          (_getSession, _session),
          (_listRequests, _requests),
          (_getRequest, _request),
          (_listErrors, _errors),
          (_listLogs, _logs),
          (_listEvents, _otherEvents),
          (_getEvent, _event),
          (_runAction, _action),
          (_callPlugin, (args) => _call(args, write: false)),
          (_callPluginWrite, (args) => _call(args, write: true)),
        ]) {
      registerTool(tool, (request) => _guard(request, run));
    }
  }

  final AppConnection app;

  Store get _store => app.store;

  Future<CallToolResult> _guard(
    CallToolRequest request,
    FutureOr<String> Function(Map<String, Object?> args) run,
  ) async {
    try {
      await app.ensure();
      final text = await run(request.arguments ?? const {});
      return CallToolResult(content: [TextContent(text: text)]);
    } on ToolException catch (e) {
      return CallToolResult(
        content: [TextContent(text: e.message)],
        isError: true,
      );
    }
  }

  /// The runs [args] picks: `run` from get_session, 0 for all, else the
  /// newest.
  Set<String> _runs(Map<String, Object?> args) {
    final number = args['run'] as int?;
    if (number == 0) return {for (final r in _store.runs) r.key};
    final run = number == null ? _store.latest : _store.run(number);
    if (run == null) {
      if (number == null) return {};
      throw ToolException('No run $number. get_session lists the runs.');
    }
    return {run.key};
  }

  Future<String> _session(Map<String, Object?> args) async {
    final latest = _store.latest;
    Map<String, Object?>? info = latest?.info?.data;
    if (latest?.isolateId case final id?) {
      try {
        info = await app.call('ext.devpul.info', id);
      } on ToolException {
        // The app.info event then.
      }
    }
    return _json({
      'vmServiceUrl': app.url,
      'connected': app.connected,
      if (app.paused.isNotEmpty) 'pausedInDebugger': true,
      if (app.incompatible.isNotEmpty)
        'incompatible': app.incompatible.values.toSet().toList(),
      if (latest != null) ...{
        'run': latest.number,
        'app': latest.session?.data,
        if (latest.session?.tags ?? const {} case final tags
            when tags.isNotEmpty)
          'tags': tags,
        'isolate': latest.isolate,
      },
      if (info != null) ...{
        'devpul': info['version'],
        'actions': info['actions'],
        ..._plugins(info),
        'limits': info['limits'],
        'dropped': info['dropped'],
      },
      'runs': [
        for (final r in _store.runs)
          {
            'run': r.number,
            'isolate': r.isolate,
            'from': _time(r.first, full: true),
            'to': _time(r.last, full: true),
            'events': r.events,
          },
      ],
    });
  }

  /// Plugins with their handlers, by the `<plugin id>.` prefix, and the
  /// handlers no plugin claims.
  Map<String, Object?> _plugins(Map<String, Object?> info) {
    final handlers = [
      for (final h in (info['handlers'] as List<Object?>?) ?? [])
        if (h case {'name': final String name})
          (
            name,
            {
              'name': name,
              'description': ?h['description'],
              'tool': _writeTool(h) ? 'call_plugin_write' : 'call_plugin',
            },
          ),
    ];
    final claimed = <String>{};
    List<Object?> of(Object? id) => [
      for (final (name, h) in handlers)
        if (name.startsWith('$id.') && claimed.add(name)) h,
    ];
    final plugins = [
      for (final p in (info['plugins'] as List<Object?>?) ?? [])
        if (p is Map)
          {
            'id': p['id'],
            'version': ?p['version'],
            'description': ?p['description'],
            if (of(p['id']) case final h when h.isNotEmpty) 'handlers': h,
          },
    ];
    final rest = [
      for (final (name, h) in handlers)
        if (!claimed.contains(name)) h,
    ];
    return {'plugins': plugins, if (rest.isNotEmpty) 'handlers': rest};
  }

  String _requests(Map<String, Object?> args) {
    final runs = _runs(args);
    final method = (args['method'] as String?)?.toUpperCase();
    final host = (args['host'] as String?)?.toLowerCase();
    final min = args['status_min'] as int?;
    final max = args['status_max'] as int?;
    final state = args['state'] as String?;
    final text = _needle(args);
    final rows = [
      for (final row in _store.requests.reversed)
        if (runs.contains(row.run) &&
            (method == null || row.method.toUpperCase() == method) &&
            (host == null || row.host.toLowerCase().contains(host)) &&
            (state == null || row.state == state) &&
            (min == null || (row.status ?? -1) >= min) &&
            (max == null || (row.status ?? 1 << 30) <= max) &&
            (text == null ||
                row.url.toLowerCase().contains(text) ||
                [
                  row.request,
                  row.response,
                  row.error,
                ].any((e) => e != null && _matches(e, text))))
          row,
    ];
    return _page(args, rows, (r) => r.number, (r) {
      final status = switch (r.state) {
        'done' => '${r.status ?? '-'}',
        final s => s,
      };
      final size = r.response != null ? _size(_bodySize(r.response!)) : '';
      return [
        r.number,
        _time(r.ts),
        r.method,
        status,
        if (r.durationMs case final ms?) '${ms.round()}ms',
        if (size.isNotEmpty) size,
        if (r.source case final source?) '[$source]',
        r.url,
      ].join(' ');
    });
  }

  String _request(Map<String, Object?> args) {
    final id = args['id'] as int;
    final row = _store.request(id);
    if (row == null) {
      throw ToolException('No request $id. list_requests gives the ids.');
    }
    final max = (args['max_chars'] as int?) ?? _maxChars;
    Map<String, Object?>? part(DevEvent? e) => e == null
        ? null
        : _cut({
            for (final MapEntry(:key, :value) in e.data.entries)
              if (!const {'id', 'method', 'url', 'source'}.contains(key))
                key: value,
          }, max);
    return _json({
      'id': row.number,
      'method': row.method,
      'url': row.url,
      'state': row.state,
      'status': ?row.status,
      'durationMs': ?row.durationMs,
      'source': ?row.source,
      'started': _time(row.ts, full: true),
      'request': ?part(row.request),
      'response': ?part(row.response),
      'error': ?part(row.error),
    });
  }

  String _errors(Map<String, Object?> args) {
    final runs = _runs(args);
    final text = _needle(args);
    final errors = [
      for (final e in _store.all)
        if (e.kind == 'error' &&
            runs.contains(e.run) &&
            (text == null || _matches(e, text)))
          e,
    ];
    return _page(args, errors, (e) => e.id, (e) {
      final d = e.data;
      return [
        e.id,
        _time(e.ts),
        _flat('${d['type'] ?? 'Error'}: ${d['message'] ?? ''}', 300),
        if (d['route'] case final String route) '(route $route)',
      ].join(' ');
    });
  }

  String _logs(Map<String, Object?> args) {
    final runs = _runs(args);
    final min = _rank(args['min_level'] as String? ?? 'debug');
    final name = args['name'] as String?;
    final text = _needle(args);
    final logs = [
      for (final e in _store.all)
        if (e.kind == 'log' &&
            runs.contains(e.run) &&
            _rank('${e.data['level']}') >= min &&
            (name == null || e.data['name'] == name) &&
            (text == null || _matches(e, text)))
          e,
    ];
    return _page(args, logs, (e) => e.id, (e) {
      final d = e.data;
      // The VM cuts developer.log messages at 128 characters.
      final message = _flat('${d['message'] ?? ''}', 300);
      final cut =
          d['objects'] is Map && (d['objects']! as Map)['message'] != null;
      return [
        e.id,
        _time(e.ts),
        d['level'] ?? 'info',
        if (d['name'] case final String name when name.isNotEmpty) '[$name]',
        message,
        if (cut) '[cut; get_event reads it all]',
        if (d['error'] case final Object error) '| ${_flat('$error', 120)}',
      ].join(' ');
    });
  }

  String _otherEvents(Map<String, Object?> args) {
    final runs = _runs(args);
    final kind = args['kind'] as String?;
    final text = _needle(args);
    final events = [
      for (final e in _store.all)
        if (runs.contains(e.run) &&
            e.kind != 'log' &&
            e.kind != 'error' &&
            !e.kind.startsWith('http.') &&
            !e.kind.startsWith('app.') &&
            (kind == null || e.kind == kind || e.kind.startsWith('$kind.')) &&
            (text == null || _matches(e, text)))
          e,
    ];
    return _page(
      args,
      events,
      (e) => e.id,
      (e) => '${e.id} ${_time(e.ts)} ${e.kind} ${oneLine(preview(e, 160))}',
    );
  }

  Future<String> _event(Map<String, Object?> args) async {
    final id = args['id'] as int;
    final e = _store.event(id);
    if (e == null) {
      throw ToolException('No event $id. The list tools give the ids.');
    }
    final max = (args['max_chars'] as int?) ?? _maxChars;
    final data = {...e.data};
    if (e.kind == 'log' && data.remove('objects') != null) {
      data.addAll(await app.loadLog(e));
    }
    if (e.kind == 'error' && data['stack'] is String) {
      data['stack'] = _fold(data['stack']! as String);
    }
    return _json({
      'id': e.id,
      'kind': e.kind,
      'time': _time(e.ts, full: true),
      'isolate': e.isolate,
      if (e.tags.isNotEmpty) 'tags': e.tags,
      'data': _cut(data, max),
      if (e.kind == 'error')
        'before': [
          for (final c in breadcrumbs(_store, e))
            '${c.kind == 'request' ? 'request ' : ''}${c.id} '
                '-${_offset(c.offset)} ${c.text}',
        ],
    });
  }

  /// The isolate of the run [args] picks, and its handshake read now:
  /// actions and handlers come and go.
  Future<(String, Map<String, Object?>)> _app(Map<String, Object?> args) async {
    final runs = _runs(args);
    final run = _store.runs.where((r) => runs.contains(r.key)).lastOrNull;
    final isolateId = run?.isolateId;
    if (run == null || isolateId == null) {
      throw ToolException('The app has sent no DevPul events yet.');
    }
    return (isolateId, await app.call('ext.devpul.info', isolateId));
  }

  Future<String> _action(Map<String, Object?> args) async {
    final (isolateId, info) = await _app(args);
    final name = args['name'] as String;
    final names = [
      for (final a in (info['actions'] as List<Object?>?) ?? [])
        if (a case {'name': final String name}) name,
    ];
    if (!names.contains(name)) {
      throw ToolException(
        names.isEmpty
            ? 'The app registers no actions.'
            : 'No action "$name". Actions: ${names.join(', ')}.',
      );
    }
    final result = await app.call('ext.devpul.action', isolateId, {
      'name': name,
      'args': jsonEncode(args['args'] ?? const <String, Object?>{}),
    });
    return _json({'result': result['result']});
  }

  Future<String> _call(Map<String, Object?> args, {required bool write}) async {
    final (isolateId, info) = await _app(args);
    final name = args['name'] as String;
    final handlers = {
      for (final h in (info['handlers'] as List<Object?>?) ?? [])
        if (h case {'name': final String name}) name: h,
    };
    final handler = handlers[name];
    if (handler == null) {
      throw ToolException(
        handlers.isEmpty
            ? 'The app registers no plugin handlers.'
            : 'No handler "$name". get_session lists them.',
      );
    }
    if (_writeTool(handler) != write) {
      throw ToolException(
        write
            ? '$name only reads; call it with call_plugin.'
            : handler['writes'] == true
            ? '$name changes the app; call it with call_plugin_write.'
            : '$name returns secrets or acts on the app; call it with '
                  'call_plugin_write.',
      );
    }
    final result = await app.call('ext.devpul.call', isolateId, {
      'name': name,
      'args': jsonEncode(args['args'] ?? const <String, Object?>{}),
      if (write) 'writes': 'true',
    });
    final max = (args['max_chars'] as int?) ?? _maxChars;
    // _cut drops null fields; a handler returning nothing says so.
    return _json({
      'result': null,
      ..._cut({'result': result['result']}, max),
    });
  }
}

bool _writeTool(Map<Object?, Object?> handler) =>
    handler['writes'] == true || handler['sensitive'] == true;

const _maxChars = 20000;

final _runParam = Schema.int(
  description:
      'A run number from get_session; 0 for every run. Default: the newest '
      'run.',
  minimum: 0,
);

final _pageParams = {
  'run': _runParam,
  'text': Schema.string(
    description: 'Only items containing this text, ignoring case.',
  ),
  'since': Schema.int(
    description:
        'Only items with a larger id: the newer ones since an earlier call.',
  ),
  'before': Schema.int(description: 'Only items with a smaller id.'),
  'limit': Schema.int(
    description:
        'At most this many: the oldest after since, else the newest. '
        'Default 50.',
    minimum: 1,
    maximum: 500,
  ),
};

final _maxCharsParam = Schema.int(
  description:
      'Strings and bodies longer than this are cut. Default $_maxChars.',
  minimum: 100,
);

final _readOnly = ToolAnnotations(readOnlyHint: true, openWorldHint: false);

final _getSession = Tool(
  name: 'get_session',
  description:
      'The connected app: name and version from its session, devpul '
      'version, actions with their parameters, plugins with their handlers '
      'and the tool that calls each, rate limits, and the runs (launches '
      'and hot restarts) recorded.',
  annotations: _readOnly,
  inputSchema: Schema.object(),
);

final _listRequests = Tool(
  name: 'list_requests',
  description:
      'HTTP requests: id, time, method, status (or pending, failed), '
      'duration, response size, URL.',
  annotations: _readOnly,
  inputSchema: Schema.object(
    properties: {
      'method': Schema.string(description: 'GET, POST and so on.'),
      'host': Schema.string(description: 'Part of the host name.'),
      'status_min': Schema.int(description: 'Lowest status, such as 400.'),
      'status_max': Schema.int(description: 'Highest status, such as 599.'),
      'state': EnumSchema.untitledSingleSelect(
        description:
            'pending (no response yet), done (a response) or failed (no '
            'response: connection error, timeout, cancel).',
        values: ['pending', 'done', 'failed'],
      ),
      ..._pageParams,
    },
  ),
);

final _getRequest = Tool(
  name: 'get_request',
  description:
      'One HTTP request with headers and bodies of request and response, or '
      'its error.',
  annotations: _readOnly,
  inputSchema: Schema.object(
    properties: {
      'id': Schema.int(description: 'The id from list_requests.'),
      'max_chars': _maxCharsParam,
    },
    required: ['id'],
  ),
);

final _listErrors = Tool(
  name: 'list_errors',
  description:
      'Errors the app reported (Flutter errors, uncaught errors, '
      'Devpul.error): id, time, type and message, route. get_event gives '
      'the stack and the routes, logs, events and requests before it.',
  annotations: _readOnly,
  inputSchema: Schema.object(properties: _pageParams),
);

final _listLogs = Tool(
  name: 'list_logs',
  description:
      'Log lines from Devpul.log, debugPrint (when captured) and '
      'developer.log: id, time, level, [logger name], message.',
  annotations: _readOnly,
  inputSchema: Schema.object(
    properties: {
      'min_level': EnumSchema.untitledSingleSelect(
        description: 'Lowest level. Default debug: all.',
        values: ['debug', 'info', 'warning', 'error'],
      ),
      'name': Schema.string(description: 'Logger name.'),
      ..._pageParams,
    },
  ),
);

final _listEvents = Tool(
  name: 'list_events',
  description:
      'Route changes, state changes from plugins and custom events '
      '(Devpul.emit): id, time, kind, fields.',
  annotations: _readOnly,
  inputSchema: Schema.object(
    properties: {
      'kind': Schema.string(
        description:
            'Event kind, such as route; also matches kinds under it '
            '(riverpod matches riverpod.update).',
      ),
      ..._pageParams,
    },
  ),
);

final _getEvent = Tool(
  name: 'get_event',
  description:
      'One error, log or event with all its fields. An error comes with its '
      'stack (framework frames folded) and, under before, the routes, logs, '
      'events and requests of its run before it, newest first, each with '
      'its id and time before the error.',
  annotations: _readOnly,
  inputSchema: Schema.object(
    properties: {
      'id': Schema.int(description: 'The id from a list tool.'),
      'max_chars': _maxCharsParam,
    },
    required: ['id'],
  ),
);

final _runAction = Tool(
  name: 'run_action',
  description:
      'Runs one of the actions the app registered with Devpul.action, as '
      'its button in the DevPul UI does. get_session lists them with their '
      'parameters. Runs app code.',
  annotations: ToolAnnotations(readOnlyHint: false, openWorldHint: false),
  inputSchema: Schema.object(
    properties: {
      'name': Schema.string(description: 'The action name.'),
      'args': Schema.object(
        description: 'Parameter values by name. Missing ones take defaults.',
        additionalProperties: true,
      ),
      'run': _runParam,
    },
    required: ['name'],
  ),
);

final _callParams = {
  'name': Schema.string(
    description: 'The handler name, such as sqflite.query.',
  ),
  'args': Schema.object(
    description: 'Arguments as its description in get_session names them.',
    additionalProperties: true,
  ),
  'max_chars': _maxCharsParam,
  'run': _runParam,
};

final _callPlugin = Tool(
  name: 'call_plugin',
  description:
      'Calls a plugin handler that only reads, such as the rows of a SQL '
      'query, the files list or the router state, and returns its result as '
      'JSON. get_session lists the handlers with their arguments and the '
      'tool for each.',
  annotations: _readOnly,
  inputSchema: Schema.object(properties: _callParams, required: ['name']),
);

final _callPluginWrite = Tool(
  name: 'call_plugin_write',
  description:
      'Calls a plugin handler that changes the app (writes data, navigates) '
      'or returns secrets, and returns its result as JSON. get_session lists '
      'the handlers with their arguments and the tool for each.',
  annotations: ToolAnnotations(
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  ),
  inputSchema: Schema.object(properties: _callParams, required: ['name']),
);

String _json(Object? value) => const JsonEncoder.withIndent(' ').convert(value);

String? _needle(Map<String, Object?> args) =>
    (args['text'] as String?)?.toLowerCase();

bool _matches(DevEvent e, String needle) =>
    '${e.kind} ${jsonEncode(e.data)}'.toLowerCase().contains(needle);

/// [items] (oldest first) cut by `since`, `before` and `limit`, one line
/// each, with a note when some are left out.
String _page<T>(
  Map<String, Object?> args,
  List<T> items,
  int Function(T) id,
  String Function(T) line,
) {
  final since = args['since'] as int?;
  final before = args['before'] as int?;
  final limit = (args['limit'] as int?) ?? 50;
  final range = [
    for (final item in items)
      if ((since == null || id(item) > since) &&
          (before == null || id(item) < before))
        item,
  ];
  if (range.isEmpty) return 'None.';
  final page = since != null
      ? range.take(limit).toList()
      : range.skip(range.length - limit.clamp(0, range.length)).toList();
  final lines = page.map(line).toList();
  final left = range.length - page.length;
  if (left > 0) {
    lines.add(
      since != null
          ? '$left more; pass since: ${id(page.last)}.'
          : '$left older; pass before: ${id(page.first)}.',
    );
  }
  return lines.join('\n');
}

String _two(int n) => n.toString().padLeft(2, '0');

String _time(int ms, {bool full = false}) {
  final t = DateTime.fromMillisecondsSinceEpoch(ms);
  if (full) return t.toIso8601String();
  return '${_two(t.hour)}:${_two(t.minute)}:${_two(t.second)}.'
      '${t.millisecond.toString().padLeft(3, '0')}';
}

String _offset(int ms) => ms < 1000
    ? '${ms}ms'
    : ms < 60000
    ? '${(ms / 1000).toStringAsFixed(1)}s'
    : '${ms ~/ 60000}m${(ms % 60000) ~/ 1000}s';

String _size(int bytes) => bytes < 1024
    ? '${bytes}B'
    : bytes < 1024 * 1024
    ? '${(bytes / 1024).toStringAsFixed(1)}kB'
    : '${(bytes / 1024 / 1024).toStringAsFixed(1)}MB';

/// Message text on one line with how much was cut.
String _flat(String text, int max) {
  final line = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  return line.length > max
      ? '${line.substring(0, max)} [+${line.length - max} chars]'
      : line;
}

// Response body bytes, from content-length or the body, as the UI counts.
int _bodySize(DevEvent e) {
  if (e.data['headers'] case final Map<Object?, Object?> headers) {
    for (final MapEntry(:key, :value) in headers.entries) {
      if ('$key'.toLowerCase() != 'content-length') continue;
      final n = int.tryParse('${value is List ? value.firstOrNull : value}');
      if (n != null) return n;
    }
  }
  return switch (e.data['body']) {
    null => 0,
    final String s => switch (RegExp(r'^<(\d+) bytes>$').firstMatch(s)) {
      final m? => int.parse(m[1]!),
      _ => utf8.encode(s).length,
    },
    {'devpul.truncated': {'size': final num size}} => size.toInt(),
    final body => utf8.encode(jsonEncode(body)).length,
  };
}

/// [data] without null fields, long strings cut and any value whose JSON
/// passes [max] replaced by its cut JSON text, noted under `cut`.
Map<String, Object?> _cut(Map<String, Object?> data, int max) {
  final cut = <String, int>{};
  Object? walk(String path, Object? value) {
    if (value is String) {
      if (value.length <= max) return value;
      cut[path] = value.length;
      return value.substring(0, max);
    }
    if (value is Map || value is List) {
      final text = jsonEncode(value);
      if (text.length <= max) return value;
      if (value is Map) {
        return {
          for (final MapEntry(:key, :value) in value.entries)
            '$key': walk(path.isEmpty ? '$key' : '$path.$key', value),
        };
      }
      cut[path] = text.length;
      return text.substring(0, max);
    }
    return value;
  }

  final out =
      walk('', {
            for (final MapEntry(:key, :value) in data.entries) key: ?value,
          })!
          as Map<String, Object?>;
  if (cut.isNotEmpty) {
    out['cut'] = {
      for (final MapEntry(:key, :value) in cut.entries)
        key: 'first $max of $value characters',
    };
  }
  return out;
}

/// The stack with each run of Flutter and SDK frames cut to its first
/// frame, where the call entered the framework, and a count of the rest.
String _fold(String stack) {
  final Trace trace;
  try {
    trace = Trace.parse(stack);
  } on FormatException {
    return stack;
  }
  if (trace.frames.isEmpty || trace.frames.any((f) => f is UnparsedFrame)) {
    return stack;
  }
  final lines = <String>[];
  var folded = 0;
  var inFramework = false;
  for (final frame in trace.frames) {
    final framework = frame.isCore || frame.package == 'flutter';
    if (framework && inFramework) {
      folded++;
      continue;
    }
    if (folded > 0) lines.add('  ($folded framework frames)');
    folded = 0;
    inFramework = framework;
    lines.add('${frame.location}  ${frame.member}');
  }
  if (folded > 0) lines.add('  ($folded framework frames)');
  return lines.join('\n');
}

int _rank(String level) => switch (level.toLowerCase()) {
  'finest' || 'finer' || 'fine' || 'debug' || 'verbose' || 'trace' => 0,
  'warn' || 'warning' => 2,
  'error' || 'severe' => 3,
  'shout' || 'fatal' => 4,
  _ => 1,
};
