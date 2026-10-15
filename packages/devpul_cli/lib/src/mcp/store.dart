import 'events.dart';

/// A request with its response or error, as the UI's Network tab shows it.
final class HttpRow {
  HttpRow(this.key, this.run, this.session, this.id);

  final String key;
  final String run;
  final String session;

  /// The id the app gave it.
  final String id;

  /// The [DevEvent.id] of its first event. The id tools take.
  int number = 0;
  DevEvent? request;
  DevEvent? response;
  DevEvent? error;

  /// The latest `http.paused` event.
  DevEvent? paused;

  /// `seq` of the latest `http.resumed` event.
  int resumed = 0;

  DevEvent get first => (request ?? response ?? error ?? paused)!;
  DevEvent? get end => response ?? error;
  int get ts => request?.ts ?? first.ts;
  int get seq => request?.seq ?? first.seq;
  String get method => _field('method') ?? '';
  String get url => _field('url') ?? '';
  String get host => Uri.tryParse(url)?.host ?? '';
  int? get status => (end?.data['status'] as num?)?.toInt();
  num? get durationMs => end?.data['durationMs'] as num?;
  String? get source => _field('source');

  /// The mode of the mock rule that changed the call.
  String? get mock => switch (end?.data['mock'] ?? request?.data['mock']) {
    final String s => s,
    _ => null,
  };

  bool get held => paused != null && paused!.seq > resumed;

  String get state => error != null
      ? 'failed'
      : response != null
      ? 'done'
      : held
      ? 'paused'
      : 'pending';

  String? _field(String name) => switch (first.data[name]) {
    final String s => s,
    _ => null,
  };
}

/// A run: one app launch or hot restart.
final class Run {
  Run(this.key, this.number);

  final String key;

  /// The id tools take.
  final int number;
  int first = 0;
  int last = 0;
  int events = 0;
  String isolate = '';
  String? isolateId;
  DevEvent? session;
  DevEvent? info;
}

// Three full app backlogs, as the UI keeps by default.
const defaultMaxBytes = 50 * 1024 * 1024;

/// The events of every connection, deduplicated by key, oldest dropped past
/// [maxBytes]. `app.*` events stay.
final class Store {
  Store({this.maxBytes = defaultMaxBytes});

  final int maxBytes;
  final _events = <String, DevEvent>{};
  final _byId = <int, DevEvent>{};
  final _runs = <String, Run>{};
  final _runNumbers = <String, int>{};
  var _next = 0;
  var _bytes = 0;
  var _http = <String, HttpRow>{};

  Iterable<DevEvent> get all => _events.values;
  DevEvent? event(int id) => _byId[id];
  Iterable<Run> get runs => _runs.values;

  /// The run with the newest event.
  Run? get latest {
    Run? best;
    for (final run in _runs.values) {
      if (best == null || run.last >= best.last) best = run;
    }
    return best;
  }

  Run? run(int number) {
    for (final run in _runs.values) {
      if (run.number == number) return run;
    }
    return null;
  }

  /// Newest first.
  List<HttpRow> get requests =>
      _http.values.toList()..sort((a, b) => _newest(a.ts, a.seq, b.ts, b.seq));

  HttpRow? request(int number) {
    for (final row in _http.values) {
      if (row.number == number) return row;
    }
    return null;
  }

  /// Adds the events not already known and returns how many were new.
  int add(Iterable<DevEvent> incoming) {
    var added = 0;
    for (final e in incoming) {
      if (_events.containsKey(e.key)) continue;
      e.id = ++_next;
      _events[e.key] = e;
      _byId[e.id] = e;
      _bytes += e.size;
      _index(e);
      added++;
    }
    if (_bytes > maxBytes) _evict();
    return added;
  }

  void _index(DevEvent e) {
    final run = _runs.putIfAbsent(
      e.run,
      () => Run(
        e.run,
        _runNumbers.putIfAbsent(e.run, () => _runNumbers.length + 1),
      ),
    );
    if (run.events++ == 0) run.first = e.ts;
    if (e.ts < run.first) run.first = e.ts;
    if (e.ts > run.last) run.last = e.ts;
    // The isolate that registered DevPul's extensions; a spawned isolate in
    // the same group may post events without them.
    if (e.kind == 'app.info' || run.isolateId == null) {
      run
        ..isolate = e.isolate
        ..isolateId = e.isolateId;
    }
    if (e.kind == 'app.session') run.session = _newer(run.session, e);
    if (e.kind == 'app.info') run.info = _newer(run.info, e);
    if (e.kind.startsWith('http.')) _indexHttp(e);
  }

  void _indexHttp(DevEvent e) {
    final id = switch (e.data['id']) {
      final String s => s,
      final num n => '$n',
      _ => '?',
    };
    final key = '${e.session}|$id';
    if (e.kind == 'http.resumed') {
      final row = _http[key];
      if (row != null && e.seq > row.resumed) row.resumed = e.seq;
      return;
    }
    if (!const {
      'http.request',
      'http.response',
      'http.error',
      'http.paused',
    }.contains(e.kind)) {
      return;
    }
    final row = _http.putIfAbsent(key, () {
      return HttpRow(key, e.run, e.session, id)..number = e.id;
    });
    switch (e.kind) {
      case 'http.request':
        row.request = e;
      case 'http.response':
        row.response = e;
      case 'http.error':
        row.error = e;
      case 'http.paused':
        if (row.paused == null || e.seq > row.paused!.seq) row.paused = e;
    }
  }

  // Down to 90%, so a steady stream does not reindex on every event.
  void _evict() {
    final target = maxBytes * 0.9;
    final newest = _events.values.last;
    for (final e in _events.values.toList()) {
      if (_bytes <= target) break;
      if (e == newest || e.kind.startsWith('app.')) continue;
      _events.remove(e.key);
      _byId.remove(e.id);
      _bytes -= e.size;
    }
    _runs.clear();
    _http = {};
    _events.values.forEach(_index);
  }
}

DevEvent _newer(DevEvent? a, DevEvent b) =>
    a == null || _newest(a.ts, a.seq, b.ts, b.seq) >= 0 ? b : a;

int _newest(int aTs, int aSeq, int bTs, int bSeq) =>
    bTs != aTs ? bTs - aTs : bSeq - aSeq;

/// A route, log, event or request before an error.
final class Crumb {
  Crumb(
    this.kind,
    this.id,
    this.ts,
    this.offset,
    this.text,
    this._session,
    this._seq,
  );

  /// `route`, `log`, `event` or `request`.
  final String kind;

  /// The event id, or the request id for a request.
  final int id;
  final int ts;

  /// Milliseconds before the error.
  final int offset;
  final String text;
  final String _session;
  final int _seq;
}

const maxCrumbs = 30;

// Within one session seq decides; across sessions (developer.log, HTTP
// profile) the clock does.
bool _before(int ts, String session, int seq, DevEvent error) =>
    ts < error.ts ||
    (ts == error.ts && (session != error.session || seq < error.seq));

String? _crumbKind(DevEvent e) => switch (e.kind) {
  'route' => 'route',
  'log' => 'log',
  'error' => null,
  final k when k.startsWith('app.') || k.startsWith('http.') => null,
  _ => 'event',
};

/// The routes, logs, events and requests of the error's run before it,
/// newest first, as `apps/ui/src/core/breadcrumbs.ts` builds them.
List<Crumb> breadcrumbs(Store store, DevEvent error, [int max = maxCrumbs]) {
  final out = <Crumb>[];
  for (final e in store.all) {
    if (e.run != error.run || !_before(e.ts, e.session, e.seq, error)) {
      continue;
    }
    final kind = _crumbKind(e);
    if (kind == null) continue;
    final text = switch (kind) {
      'route' => [
        _str(e.data['action']),
        _str(e.data['route']),
      ].whereType<String>().where((s) => s.isNotEmpty).join(' '),
      'log' =>
        '${_str(e.data['level']) ?? 'info'} ${_str(e.data['message']) ?? ''}',
      _ => '${e.kind} ${preview(e, 120)}',
    };
    out.add(
      Crumb(kind, e.id, e.ts, error.ts - e.ts, oneLine(text), e.session, e.seq),
    );
  }
  for (final row in store.requests) {
    if (row.run != error.run || !_before(row.ts, row.session, row.seq, error)) {
      continue;
    }
    final text = [
      row.method,
      switch (row.state) {
        'failed' => 'failed',
        'pending' => 'pending',
        'paused' => 'paused',
        _ => row.status?.toString(),
      },
      row.url,
    ].whereType<String>().where((s) => s.isNotEmpty).join(' ');
    out.add(
      Crumb(
        'request',
        row.number,
        row.ts,
        error.ts - row.ts,
        oneLine(text),
        row.session,
        row.seq,
      ),
    );
  }
  // Stable, as the UI's toSorted: crumbs of two sessions in one
  // millisecond keep their order.
  final order = [for (var i = 0; i < out.length; i++) i]
    ..sort((i, j) {
      final (a, b) = (out[i], out[j]);
      if (b.ts != a.ts) return b.ts - a.ts;
      if (a._session == b._session && a._seq != b._seq) return b._seq - a._seq;
      return i - j;
    });
  return [for (final i in order.take(max)) out[i]];
}

String? _str(Object? v) => switch (v) {
  final String s => s,
  final num n => '$n',
  _ => null,
};

/// Whitespace runs as one space, cut at [max] characters.
String oneLine(String text, [int max = 200]) {
  final line = text.replaceAll(RegExp(r'\s+'), ' ').trim();
  return line.length > max ? line.substring(0, max) : line;
}
