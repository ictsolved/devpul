import 'dart:convert';
import 'dart:io';

import 'package:devpul_cli/src/mcp/events.dart';
import 'package:devpul_cli/src/mcp/store.dart';
import 'package:test/test.dart';

// Fixtures the devpul and devpul_flutter golden tests write; the UI reads the
// same ones.
Object? read(String name) =>
    jsonDecode(File('../../contract/$name').readAsStringSync());

List<DevEvent> load(String name) => [
  for (final item
      in (read(name)! as List<Object?>).cast<Map<String, Object?>>())
    fromVm({
      'extensionKind': item['kind'],
      'extensionData': item['data'],
      'isolate': {'id': 'isolates/1', 'name': 'main'},
      'isolateGroup': {'id': 'isolateGroups/1'},
    }, 'c1')!,
];

void main() {
  final events = [...load('events.json'), ...load('flutter.json')];

  test('reads every contract event as the UI does', () {
    final store = Store()..add(events);
    expect(store.all, hasLength(events.length));
    expect(store.requests.map((r) => [r.method, r.state, r.status]), [
      ['POST', 'done', 500],
      ['GET', 'failed', null],
      ['POST', 'done', 201],
    ]);
    final kinds = store.all.map((e) => e.kind);
    expect(kinds.where((k) => k == 'error'), hasLength(2));
    expect(kinds.where((k) => k == 'log'), hasLength(2));
    final run = store.latest!;
    expect(run.number, 1);
    expect(run.key, 'c1|isolateGroups/1');
    expect(run.session?.data['name'], 'Shop');
    expect(run.info?.data['protocol'], protocol);
    expect(store.add(events), 0, reason: 'a backlog repeats events');
  });

  test('builds breadcrumbs as the UI does, matching contract/'
      'breadcrumbs.json', () {
    final store = Store()..add(events);
    final value = [
      for (final e in store.all.where((e) => e.kind == 'error'))
        {
          'error': e.key,
          'crumbs': [
            for (final c in breadcrumbs(store, e))
              {
                'kind': c.kind,
                'key': c.kind == 'request'
                    ? store.request(c.id)!.key
                    : store.event(c.id)!.key,
                'offset': c.offset,
                'text': c.text,
              },
          ],
        },
    ];
    final file = File('../../contract/breadcrumbs.json');
    final text = '${const JsonEncoder.withIndent('  ').convert(value)}\n';
    if (Platform.environment['DEVPUL_UPDATE_GOLDENS'] != null) {
      file.writeAsStringSync(text);
    }
    expect(
      file.readAsStringSync(),
      text,
      reason: 'contract/breadcrumbs.json differs; run tool/update_goldens.sh',
    );
    expect(value.last['crumbs'], [
      for (final text in [
        'push Cart',
        'GET failed https://example.com/slow',
        'lifecycle state: resumed',
        'lifecycle state: inactive',
        'POST 201 https://example.com/items?page=1&tag=a&tag=b',
        'pop /checkout',
        'error Sync failed',
        'replace /checkout',
        'info Signed in',
        'push /cart',
        'push /',
      ])
        containsPair('text', text),
    ]);
  });

  test('reads developer.log records as the UI does', () {
    final fixture = read('logging.json')! as Map<String, Object?>;
    final records = [
      for (final e in fixture['events']! as List<Object?>)
        e! as Map<String, Object?>,
    ];
    final [withError!, long!] = [
      for (final e in records) fromLogging(e, run: 'c1|isolateGroups/1'),
    ];
    expect(withError.data, {
      'level': 'warning',
      'message': 'token refresh failed',
      'source': developerLog,
      'name': 'auth',
      'error': 'StateError',
      'objects': {'error': 'objects/3', 'stack': 'objects/4'},
    });
    expect(withError.key, 'log:isolates/1|${withError.seq}');
    expect(withError.seq ~/ 1000, withError.ts);
    expect(long.data['message'], hasLength(128));
    expect(long.data['objects'], {'message': 'objects/5', 'length': 371});
    expect(
      fromLogging(records.first, run: 'c1|isolateGroups/1')!.key,
      withError.key,
      reason: 'DDS replays records; the key stays',
    );
    expect(fromLogging({'kind': 'Logging'}, run: 'r'), isNull);
    expect([0, 500, 800, 900, 1000, 1200].map(levelName), [
      'info',
      'fine',
      'info',
      'warning',
      'severe',
      'shout',
    ]);
  });

  test('evicts the oldest events past the cap, keeping app.* and ids', () {
    final store = Store(maxBytes: 2000)..add(events);
    expect(store.all.length, lessThan(events.length));
    expect(
      store.all.where((e) => e.kind.startsWith('app.')),
      hasLength(events.where((e) => e.kind.startsWith('app.')).length),
    );
    final last = store.all.last;
    expect(store.event(last.id), same(last));
    expect(store.latest!.number, 1);
  });
}
