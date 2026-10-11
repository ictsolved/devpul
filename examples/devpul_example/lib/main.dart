import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:math';
import 'dart:ui' as ui;

import 'package:bloc/bloc.dart';
import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:devpul_flutter/devpul_flutter.dart';
import 'package:devpul_http/devpul_http.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:path_provider/path_provider.dart';

import 'devpul/plugins.dart';

const baseUrl = 'https://httpbin.org';

void main() {
  Devpul.configure(const DevpulConfig(redactHeaders: _maskAuthorization));
  DevpulFlutter.install();
  DevpulFlutter.captureDebugPrint();
  DevpulPlugins.install();
  Devpul.session(
    {
      'name': 'DevPul example',
      'version': '0.2.0',
      'platform': kIsWeb ? 'web' : defaultTargetPlatform.name,
      'baseUrl': baseUrl,
    },
    tags: {'env': 'demo'},
  );
  Devpul.action('Clear token', (_) {
    dio.options.headers.remove('Authorization');
    return 'signed out';
  });
  Devpul.action(
    'Ping',
    (_) async => (await dio.get<Object?>('/get')).statusCode,
  );
  Devpul.action(
    'Get status',
    (args) async => (await client.get(
      Uri.parse('$baseUrl/status/${args['code']}'),
    )).statusCode,
    params: const [
      DevpulParam.choice('code', ['200', '404', '500']),
    ],
  );
  DevpulBloc.install();
  DevpulFiles.install();
  runApp(
    UncontrolledProviderScope(container: container, child: const ExampleApp()),
  );
}

final container = ProviderContainer(observers: devpulRiverpodObservers());

final cartProvider = NotifierProvider<Cart, List<String>>(
  Cart.new,
  name: 'cart',
);

class Cart extends Notifier<List<String>> {
  @override
  List<String> build() => [];

  void add(String sku) => state = [...state, sku];
}

sealed class CounterEvent {}

final class Increment extends CounterEvent {
  @override
  String toString() => 'Increment';
}

class CounterBloc extends Bloc<CounterEvent, int> {
  CounterBloc() : super(0) {
    on<Increment>((_, emit) => emit(state + 1));
  }
}

final counter = CounterBloc();

// Redaction is opt-in. Without it the UI shows every header as sent.
Map<String, Object?> _maskAuthorization(
  Uri url,
  Map<String, Object?> headers,
) => {
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

// Something to look at in the Files tab.
Future<void> _writeFiles() async {
  final dir = (await getApplicationSupportDirectory()).path;
  await Directory('$dir/logs').create(recursive: true);
  await File(
    '$dir/notes.txt',
  ).writeAsString('Shopping list\n- milk\n- bread\n');
  await File('$dir/cart.json').writeAsString(
    jsonEncode({
      'items': ['sku-1', 'sku-2'],
      'total': 19.0,
    }),
  );
  await File(
    '$dir/logs/app.log',
  ).writeAsString('${DateTime.now()} files written\n', mode: FileMode.append);
  await File(
    '$dir/blob.bin',
  ).writeAsBytes(List.generate(2048, (i) => i * 7 % 256));
  final recorder = ui.PictureRecorder();
  Canvas(
    recorder,
  ).drawCircle(const Offset(32, 32), 28, Paint()..color = Colors.teal);
  final image = await recorder.endRecording().toImage(64, 64);
  final png = await image.toByteData(format: ui.ImageByteFormat.png);
  await File('$dir/dot.png').writeAsBytes(png!.buffer.asUint8List());
}

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
      () => _run(() => dio.get<Object?>('/get', queryParameters: {'page': 1})),
    ),
    (
      'POST JSON',
      () => _run(
        () => dio.post<Object?>('/post', data: {'sku': 'abc-1', 'qty': 2}),
      ),
    ),
    (
      'Upload form',
      () => _run(
        () => dio.post<Object?>(
          '/post',
          data: FormData.fromMap({
            'note': "it's a test",
            'file': MultipartFile.fromBytes([1, 2, 3], filename: 'photo.png'),
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
      () => _run(
        () => dio.get<Object?>(
          '/redirect-to',
          queryParameters: {'url': '$baseUrl/get'},
        ),
      ),
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
            _run(() => dio.get<Object?>('/delay/${random.nextInt(3)}')),
          );
        }
      },
    ),
    (
      'Large response',
      () => _run(
        () => dio.get<Object?>('https://jsonplaceholder.typicode.com/photos'),
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
      'Riverpod: add to cart',
      () => container.read(cartProvider.notifier).add('sku-${_cart++}'),
    ),
    ('Bloc: increment', () => counter.add(Increment())),
    (
      'Logs',
      () {
        Devpul.log('Cart opened', name: 'cart');
        Devpul.log('Retrying sync', level: 'warn', name: 'sync');
        Devpul.log(
          'Sync failed',
          level: 'error',
          name: 'sync',
          error: const FormatException('x'),
        );
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
    if (!kIsWeb) ('Write files', _writeFiles),
    if (!kIsWeb)
      (
        'Background isolate',
        () => Isolate.run(() {
          Devpul.emit('isolate.work', {
            'result': List.generate(5, (i) => i * i),
          });
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
