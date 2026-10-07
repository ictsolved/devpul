import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost, debugRunAction;
import 'package:test/test.dart';

void main() {
  final envelopes = <Map<String, Object?>>[];
  final events = <(String, Map<String, Object?>)>[];

  setUp(() {
    envelopes.clear();
    events.clear();
    Devpul.tags.clear();
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugOnPost = (kind, event) {
      envelopes.add(event);
      events.add((kind, event['data']! as Map<String, Object?>));
    };
  });

  test('wraps data in the envelope', () {
    Devpul.emit('custom', {'a': 1, 'v': 9});
    final event = envelopes.single;
    expect(events.single.$1, 'custom');
    expect(event.keys, ['v', 'session', 'seq', 'ts', 'data']);
    expect(event['v'], 1);
    expect(event['session'], matches(RegExp(r'^[0-9a-z]{8,}$')));
    expect(event['seq'], isA<int>());
    expect(event['ts'], isA<int>());
    expect(event['data'], {'a': 1, 'v': 9});
  });

  test('increments seq', () {
    Devpul.emit('a', {});
    Devpul.emit('b', {});
    expect(envelopes[1]['seq'] as int, (envelopes[0]['seq'] as int) + 1);
  });

  test('adds tags', () {
    Devpul.tags['env'] = 'staging';
    Devpul.emit('custom', {});
    expect(envelopes.single['tags'], {'env': 'staging'});
  });

  test('session sets tags and emits free-form info', () {
    Devpul.session({'name': 'demo', 'flavor': 'dev'}, tags: {'flavor': 'dev'});
    final (kind, event) = events.single;
    expect(kind, 'app.session');
    expect(event['name'], 'demo');
    expect(envelopes.single['tags'], {'flavor': 'dev'});
  });

  test('truncates large fields', () {
    Devpul.configure(
      const DevpulConfig(console: ConsoleMode.off, maxValueLength: 10),
    );
    Devpul.emit('custom', {'small': 'ok', 'big': 'z' * 100});
    final event = events.single.$2;
    expect(event['small'], 'ok');
    expect((event['big']! as Map)[truncatedKey], isA<Map<String, Object?>>());
  });

  test('error emits type, message and stack', () {
    Devpul.error(StateError('bad'), StackTrace.current, source: 'zone');
    final (kind, event) = events.single;
    expect(kind, 'error');
    expect(event['source'], 'zone');
    expect(event['type'], 'StateError');
    expect(event['message'], 'Bad state: bad');
    expect(event['stack'], isA<String>());
  });

  test('error carries diagnostics and the silent flag', () {
    Devpul.error('x', null, information: 'widget: Foo', silent: true);
    Devpul.error('y', null);
    expect(events[0].$2['information'], 'widget: Foo');
    expect(events[0].$2['silent'], isTrue);
    expect(events[1].$2.containsKey('silent'), isFalse);
  });

  test('log emits level, name and error text', () {
    Devpul.log('signed in', name: 'auth');
    Devpul.log('failed', level: 'error', error: StateError('x'));
    expect(events.map((e) => e.$1), ['log', 'log']);
    expect(events[0].$2, containsPair('level', 'info'));
    expect(events[0].$2, containsPair('name', 'auth'));
    expect(events[1].$2['error'], 'Bad state: x');
    expect(events[1].$2.containsKey('name'), isFalse);
  });

  test('actions announce their names and run by name', () async {
    Devpul.action('Clear cache', () => 3);
    Devpul.action('Sign out', () async => DateTime.utc(2026));
    expect(events.last.$1, 'app.actions');
    expect(events.last.$2['actions'], ['Clear cache', 'Sign out']);
    expect(await debugRunAction('Clear cache'), 3);
    expect(await debugRunAction('Sign out'), '2026-01-01T00:00:00.000Z');
    expect(() => debugRunAction('nope'), throwsArgumentError);
  });

  test('disabled emits nothing', () {
    Devpul.configure(const DevpulConfig(enabled: false));
    Devpul.emit('custom', {});
    Devpul.error('x', null);
    Devpul.log('x');
    Devpul.action('x', () => null);
    expect(events, isEmpty);
  });
}
