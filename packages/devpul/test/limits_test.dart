import 'package:devpul/src/limits.dart';
import 'package:test/test.dart';

void main() {
  test('allows up to the limit per second window', () {
    final limits = Limits()..set('route', 2);
    expect(
      [for (var t = 0; t < 4; t++) limits.allow('route', t)],
      [true, true, false, false],
    );
    expect(limits.allow('route', 1000), isTrue);
    expect(limits.dropped, {'route': 2});
  });

  test('takes the longest matching kind', () {
    final limits = Limits()
      ..set('http', 0)
      ..set('http.error', 5);
    expect(limits.allow('http.request', 0), isFalse);
    expect(limits.allow('http.error', 0), isTrue);
    expect(limits.allow('log', 0), isTrue);
  });

  test('clamps negative limits and removes on null', () {
    final limits = Limits()..set('a', -3);
    expect(limits.all, {'a': 0});
    limits.set('a', null);
    expect(limits.all, isEmpty);
    expect(limits.allow('a', 0), isTrue);
  });
}
