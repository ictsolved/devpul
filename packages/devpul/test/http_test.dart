import 'package:devpul/devpul.dart';
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:test/test.dart';

void main() {
  final events = <(String, Map<String, Object?>)>[];
  final url = Uri.parse('https://example.com/items?page=2&tag=a&tag=b');

  setUp(() {
    events.clear();
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    debugOnPost = (kind, event) => events.add((kind, event));
  });

  group('calls', () {
    test('pair request and response by id', () {
      final a = DevpulHttp.request(method: 'get', url: url)!;
      final b = DevpulHttp.request(method: 'POST', url: url, body: '{"x":1}')!;
      b.response(status: 201, body: {'ok': true});
      a.error(errorType: 'connectionError', message: 'refused');

      expect(events.map((e) => e.$1), [
        'http.request',
        'http.request',
        'http.response',
        'http.error',
      ]);
      expect(events[2].$2['id'], events[1].$2['id']);
      expect(events[3].$2['id'], events[0].$2['id']);
      expect(events[0].$2['id'], isNot(events[1].$2['id']));
      expect(events[0].$2['method'], 'GET');
      expect(events[0].$2['params'], {
        'page': '2',
        'tag': ['a', 'b'],
      });
      expect(events[1].$2['body'], {'x': 1});
      expect(events[2].$2['durationMs'], isA<int>());
      expect(events[3].$2['errorType'], 'connectionError');
    });

    test('honour ignore rules', () {
      Devpul.configure(
        DevpulConfig(
          console: ConsoleMode.off,
          ignoreUrls: [RegExp(r'/health$'), 'analytics.'],
          ignoreMethods: const {'OPTIONS'},
        ),
      );
      expect(
        DevpulHttp.request(
          method: 'GET',
          url: Uri.parse('https://example.com/health'),
        ),
        isNull,
      );
      expect(
        DevpulHttp.request(
          method: 'GET',
          url: Uri.parse('https://analytics.example.com/e'),
        ),
        isNull,
      );
      expect(DevpulHttp.request(method: 'options', url: url), isNull);
      expect(DevpulHttp.request(method: 'GET', url: url), isNotNull);
      expect(events, hasLength(1));
    });

    test('apply redactors to events and curl', () {
      Devpul.configure(
        DevpulConfig(
          console: ConsoleMode.off,
          redactHeaders: (_, h) => {
            for (final e in h.entries)
              e.key: e.key.toLowerCase() == 'authorization' ? '***' : e.value,
          },
          redactBody: (_, b) => b is Map ? {...b, 'password': '***'} : b,
        ),
      );
      DevpulHttp.request(
        method: 'POST',
        url: url,
        headers: {
          'Authorization': ['Bearer secret'],
          'Accept': 'application/json',
        },
        body: {'user': 'a', 'password': 'hunter2'},
      )!
          .response(status: 200, headers: {'Authorization': 'x'}, body: {});

      final request = events[0].$2;
      expect(request['headers'], {
        'Authorization': '***',
        'Accept': 'application/json',
      });
      expect(request['body'], {'user': 'a', 'password': '***'});
      expect(request['curl'], isNot(contains('secret')));
      expect(request['curl'], isNot(contains('hunter2')));
      expect(events[1].$2['headers'], {'Authorization': '***'});
      expect(events[1].$2['body'], {'password': '***'});
    });

    test('use the configured id generator', () {
      Devpul.configure(
        DevpulConfig(console: ConsoleMode.off, idGenerator: () => 'req-1'),
      );
      DevpulHttp.request(method: 'GET', url: url);
      expect(events.single.$2['id'], 'req-1');
    });
  });

  group('DevpulForm', () {
    test('flattens fields and files', () {
      const form = DevpulForm(
        fields: [
          MapEntry('name', 'a'),
          MapEntry('tag', 'x'),
          MapEntry('tag', 'y'),
        ],
        files: [MapEntry('avatar', 'me.png'), MapEntry('tag', 'z.txt')],
      );
      expect(form.flatten(), {
        'name': 'a',
        'tag': ['x', 'y', 'z.txt'],
        'avatar': 'me.png',
      });
    });
  });

  group('normalizeBody', () {
    test('decodes JSON strings and keeps other strings', () {
      expect(normalizeBody(' {"a":[1]}'), {
        'a': [1],
      });
      expect(normalizeBody('[1,2]'), [1, 2]);
      expect(normalizeBody('{not json'), '{not json');
      expect(normalizeBody('plain'), 'plain');
    });

    test('summarises bytes', () {
      expect(normalizeBody(<int>[1, 2, 3]), '<3 bytes>');
    });
  });

  group('normalizeHeaders', () {
    test('collapses single values', () {
      expect(
        normalizeHeaders({
          'a': ['1'],
          'b': ['1', '2'],
          'c': 'x',
        }),
        {
          'a': '1',
          'b': ['1', '2'],
          'c': 'x',
        },
      );
    });
  });

  group('curl', () {
    final u = Uri.parse('https://example.com/a');

    test('GET without body', () {
      expect(
        curl('GET', u, {'Accept': 'text/plain'}, null),
        "curl 'https://example.com/a' -H 'Accept: text/plain'",
      );
    });

    test('quotes single quotes', () {
      expect(shellQuote("it's"), r"'it'\''s'");
      expect(
        curl('POST', u, {}, "{\"q\":\"it's\"}"),
        "curl -X POST 'https://example.com/a' --data-raw '{\"q\":\"it'\\''s\"}'",
      );
    });

    test('encodes maps as JSON and drops content-length', () {
      expect(
        curl('PUT', u, {'Content-Length': '9', 'X-A': '1'}, {'a': 1}),
        "curl -X PUT 'https://example.com/a' -H 'X-A: 1' --data-raw '{\"a\":1}'",
      );
    });

    test('uses -F for forms', () {
      const form = DevpulForm(
        fields: [MapEntry('note', "o'k")],
        files: [MapEntry('file', 'a b.png')],
      );
      expect(
        curl(
          'POST',
          u,
          {'content-type': 'multipart/form-data; boundary=x'},
          form,
        ),
        "curl -X POST 'https://example.com/a' -F 'note=o'\\''k' "
        "-F 'file=@a b.png'",
      );
    });

    test('HEAD uses --head', () {
      expect(curl('HEAD', u, {}, null), "curl --head 'https://example.com/a'");
    });
  });
}
