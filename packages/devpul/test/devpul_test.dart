import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:test/test.dart';

void main() {
  final events = <(String, Map<String, Object?>)>[];

  setUp(() {
    events.clear();
    Devpul.tags.clear();
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugOnPost = (kind, event) => events.add((kind, event));
  });

  test('adds the envelope', () {
    Devpul.emit('custom', {'a': 1});
    final (kind, event) = events.single;
    expect(kind, 'custom');
    expect(event['v'], 1);
    expect(event['session'], Devpul.sessionId);
    expect(event['seq'], isA<int>());
    expect(event['ts'], isA<int>());
    expect(event['a'], 1);
    expect(event.containsKey('tags'), isFalse);
  });

  test('increments seq', () {
    Devpul.emit('a', {});
    Devpul.emit('b', {});
    expect(events[1].$2['seq'] as int, (events[0].$2['seq'] as int) + 1);
  });

  test('merges tags and keeps envelope keys reserved', () {
    Devpul.tags['env'] = 'staging';
    Devpul.emit('custom', {'session': 'mine', 'v': 9, 'x': 'y'});
    final event = events.single.$2;
    expect(event['tags'], {'env': 'staging'});
    expect(event['session'], Devpul.sessionId);
    expect(event['v'], 1);
  });

  test('session sets tags and emits free-form info', () {
    Devpul.session({'name': 'demo', 'flavor': 'dev'}, tags: {'flavor': 'dev'});
    final (kind, event) = events.single;
    expect(kind, 'app.session');
    expect(event['name'], 'demo');
    expect(event['tags'], {'flavor': 'dev'});
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

  test('disabled emits nothing', () {
    Devpul.configure(const DevpulConfig(enabled: false));
    Devpul.emit('custom', {});
    Devpul.error('x', null);
    expect(events, isEmpty);
  });
}
