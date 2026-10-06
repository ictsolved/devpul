import 'dart:async';
import 'dart:isolate';
import 'dart:math';

import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:devpul_http/devpul_http.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

const baseUrl = 'https://httpbin.org';

void main() {
  Devpul.configure(const DevpulConfig(redactHeaders: _maskAuthorization));
  DevpulFlutter.install();
  DevpulFlutter.captureDebugPrint();
  Devpul.session(
    {
      'name': 'DevPul example',
      'version': '0.2.0',
      'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
      'baseUrl': baseUrl,
    },
    tags: {'env': 'demo'},
  );
  Devpul.action('Clear token', () {
    dio.options.headers.remove('Authorization');
    return 'signed out';
  });
  Devpul.action(
      'Ping', () async => (await dio.get<Object?>('/get')).statusCode);
  runApp(const ExampleApp());
}

// Redaction is opt-in. Without it the UI shows every header as sent.
Map<String, Object?> _maskAuthorization(
        Uri url, Map<String, Object?> headers) =>
    {
      for (final e in headers.entries)
        e.key: e.key.toLowerCase() == 'authorization' ? '***' : e.value,
    };

final dio = Dio(
  BaseOptions(
    baseUrl: baseUrl,
    headers: {'Authorization': 'Bearer example-token'},
    connectTimeout: const Duration(seconds: 10),
  ),
)..interceptors.add(DevpulDioInterceptor());

final client = DevpulClient();

class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'DevPul example',
        theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
        navigatorObservers: [DevpulNavigatorObserver()],
        home: const HomePage(),
      );
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  int _cart = 0;

  Future<void> _run(Future<Object?> Function() action) async {
    try {
      await action();
    } on DioException {
      // Shown in DevPul.
    }
  }

  late final _actions = <(String, VoidCallback)>[
    (
      'GET JSON',
      () => _run(() => dio.get<Object?>('/get', queryParameters: {'page': 1}))
    ),
    (
      'POST JSON',
      () => _run(
          () => dio.post<Object?>('/post', data: {'sku': 'abc-1', 'qty': 2})),
    ),
    (
      'Upload form',
      () => _run(
            () => dio.post<Object?>(
              '/post',
              data: FormData.fromMap({
                'note': "it's a test",
                'file':
                    MultipartFile.fromBytes([1, 2, 3], filename: 'photo.png'),
              }),
            ),
          ),
    ),
    (
      'package:http GET',
      () => _run(() => client.get(Uri.parse('$baseUrl/get?client=http'))),
    ),
    ('404', () => _run(() => dio.get<Object?>('/status/404'))),
    (
      'Redirect',
      () => _run(() => dio.get<Object?>('/redirect-to',
          queryParameters: {'url': '$baseUrl/get'})),
    ),
    ('500', () => _run(() => dio.get<Object?>('/status/500'))),
    ('Slow (3 s)', () => _run(() => dio.get<Object?>('/delay/3'))),
    (
      'Timeout',
      () => _run(
            () => dio.get<Object?>(
              '/delay/5',
              options: Options(receiveTimeout: const Duration(seconds: 1)),
            ),
          ),
    ),
    (
      '5 in parallel',
      () {
        final random = Random();
        for (var i = 0; i < 5; i++) {
          unawaited(
              _run(() => dio.get<Object?>('/delay/${random.nextInt(3)}')));
        }
      },
    ),
    (
      'Large response',
      () => _run(
            () =>
                dio.get<Object?>('https://jsonplaceholder.typicode.com/photos'),
          ),
    ),
    (
      'Custom event',
      () {
        setState(() => _cart++);
        Devpul.emit('cart.updated', {'items': _cart, 'total': _cart * 9.5});
      },
    ),
    (
      'Logs',
      () {
        Devpul.log('Cart opened', name: 'cart');
        Devpul.log('Retrying sync', level: 'warn', name: 'sync');
        Devpul.log('Sync failed',
            level: 'error', name: 'sync', error: const FormatException('x'));
        debugPrint('debugPrint goes to Logs too');
      },
    ),
    (
      'Open page',
      () => Navigator.of(context).push(
            MaterialPageRoute<void>(
              settings: const RouteSettings(name: '/details', arguments: 42),
              builder: (_) =>
                  Scaffold(appBar: AppBar(title: const Text('Details'))),
            ),
          ),
    ),
    ('Flutter error', () => throw StateError('Button handler failed')),
    (
      'Async error',
      () => Future<void>.delayed(
            Duration.zero,
            () => throw const FormatException('Bad payload from sync job'),
          ),
    ),
    if (!kIsWeb)
      (
        'Background isolate',
        () => Isolate.run(() {
              Devpul.emit(
                  'isolate.work', {'result': List.generate(5, (i) => i * i)});
            }),
      ),
  ];

  @override
  Widget build(BuildContext context) => Scaffold(
        appBar: AppBar(title: const Text('DevPul example')),
        body: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Run this app in debug mode, open DevPul and paste the VM service '
              'URL printed by flutter run. Every button sends something.',
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final (label, onPressed) in _actions)
                  FilledButton.tonal(onPressed: onPressed, child: Text(label)),
              ],
            ),
          ],
        ),
      );
}
