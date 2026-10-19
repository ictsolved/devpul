import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
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
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:go_router/go_router.dart';
import 'package:path_provider/path_provider.dart';
import 'package:sqflite/sqflite.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart'
    show databaseFactoryFfi, sqfliteFfiInit;
import 'package:web_socket_channel/web_socket_channel.dart';

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
  DevpulSecureStorage.install(storage: storage);
  DevpulGoRouter.attach(router);
  DevpulLocalNotifications.install();
  runApp(
    UncontrolledProviderScope(container: container, child: const ExampleApp()),
  );
  if (!kIsWeb) unawaited(_openShop());
  if (!kIsWeb) unawaited(_initNotifications());
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
    // The request links to the bloc.event that started it.
    on<Increment>((_, emit) async {
      emit(state + 1);
      await dio.post<Object?>('/anything/counter', data: {'count': state});
    });
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

Future<String> _plainGet() async {
  final http = HttpClient();
  try {
    final request = await http.getUrl(Uri.parse('$baseUrl/get?client=dart:io'));
    return await utf8.decoder.bind(await request.close()).join();
  } finally {
    http.close();
  }
}

const storage = FlutterSecureStorage();

// Something to look at in the Secure storage tab.
Future<void> _saveSecrets() async {
  await storage.write(
    key: 'auth_token',
    value: 'eyJhbGciOiJIUzI1NiJ9.e30.example',
  );
  await storage.write(
    key: 'refresh_token',
    value: 'r-${DateTime.now().millisecondsSinceEpoch}',
  );
  await storage.write(
    key: 'user',
    value: jsonEncode({'id': 7, 'email': 'user@example.com'}),
  );
}

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

// Something to look at in the WebSocket tab; the server echoes each message.
final _echoUrl = Uri.parse('wss://echo.websocket.org');
WebSocketChannel? _socket;
var _pings = 0;

void _sendSocket() {
  final socket = _socket ??= _openSocket();
  socket.sink
    ..add(jsonEncode({'type': 'ping', 'n': ++_pings}))
    ..add(Uint8List.fromList([0xca, 0xfe, _pings]));
}

WebSocketChannel _openSocket() {
  final channel = DevpulWebSocketChannel.wrap(
    WebSocketChannel.connect(_echoUrl),
    _echoUrl,
  );
  channel.stream.listen(
    (_) {},
    onError: (Object _) {},
    onDone: () {
      if (identical(_socket, channel)) _socket = null;
    },
  );
  return channel;
}

void _closeSocket() {
  _socket?.sink.close(1000, 'Done');
  _socket = null;
}

// Something to look at in the Notifications tab; a tap opens the payload's
// route.
Future<void> _initNotifications() async {
  await FlutterLocalNotificationsPlugin().initialize(
    settings: const InitializationSettings(
      android: AndroidInitializationSettings('@mipmap/ic_launcher'),
      iOS: DarwinInitializationSettings(),
      macOS: DarwinInitializationSettings(),
      linux: LinuxInitializationSettings(defaultActionName: 'Open'),
      windows: WindowsInitializationSettings(
        appName: 'DevPul example',
        appUserModelId: 'com.example.devpul_example',
        guid: '6f1d2c1e-8a4b-4f0e-9c3d-2b7a5e9f1c04',
      ),
    ),
    onDidReceiveNotificationResponse: DevpulLocalNotifications.wrap((response) {
      final payload = response.payload;
      if (payload != null && payload.startsWith('/')) router.go(payload);
    }),
  );
}

var _notifications = 0;

void _showNotification() => FlutterLocalNotificationsPlugin().show(
  id: ++_notifications,
  title: 'Order shipped',
  body: 'Order $_notifications is on its way.',
  payload: '/details/$_notifications',
  notificationDetails: const NotificationDetails(
    android: AndroidNotificationDetails('orders', 'Orders'),
  ),
);

Database? shop;

// Something to look at in the SQLite tab.
Future<void> _openShop() async {
  if (Platform.isLinux || Platform.isWindows) {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
  }
  final db = await openDatabase(
    'shop.db',
    version: 1,
    onCreate: (db, _) async {
      await db.execute(
        'CREATE TABLE customer (id INTEGER PRIMARY KEY, name TEXT NOT NULL, '
        'email TEXT UNIQUE)',
      );
      await db.execute(
        'CREATE TABLE "order" (id INTEGER PRIMARY KEY, '
        'customer_id INTEGER REFERENCES customer (id), total REAL, '
        'created TEXT, receipt BLOB)',
      );
      await db.execute('CREATE INDEX order_customer ON "order" (customer_id)');
      await db.execute(
        'CREATE TRIGGER order_created AFTER INSERT ON "order" '
        'WHEN NEW.created IS NULL BEGIN UPDATE "order" '
        "SET created = datetime('now') WHERE id = NEW.id; END",
      );
      await db.execute(
        'CREATE VIEW customer_total AS SELECT c.name, count(o.id) AS orders, '
        'sum(o.total) AS total FROM customer c '
        'LEFT JOIN "order" o ON o.customer_id = c.id GROUP BY c.id',
      );
      for (final name in ['Ada', 'Grace', 'Linus']) {
        await db.insert('customer', {
          'name': name,
          'email': '${name.toLowerCase()}@example.com',
        });
      }
      final batch = db.batch();
      for (var i = 0; i < 240; i++) {
        batch.insert('order', _order(i));
      }
      await batch.commit(noResult: true);
    },
  );
  shop = db;
  DevpulSqflite.add(db, name: 'shop');
}

Map<String, Object?> _order(int i) => {
  'customer_id': i % 3 + 1,
  'total': (i * 7 % 50) + 0.99,
  'receipt': i.isEven
      ? Uint8List.fromList(List.generate(64, (j) => i ^ j))
      : null,
};

final router = GoRouter(
  observers: [DevpulNavigatorObserver()],
  routes: [
    GoRoute(
      path: '/',
      builder: (_, _) => const HomePage(),
      routes: [
        GoRoute(
          path: 'details/:id',
          name: 'details',
          builder: (_, state) => Scaffold(
            appBar: AppBar(
              title: Text('Details ${state.pathParameters['id']}'),
            ),
          ),
        ),
      ],
    ),
  ],
);

class ExampleApp extends StatelessWidget {
  const ExampleApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp.router(
    title: 'DevPul example',
    theme: ThemeData(colorSchemeSeed: Colors.teal, useMaterial3: true),
    darkTheme: ThemeData(
      colorSchemeSeed: Colors.teal,
      brightness: Brightness.dark,
      useMaterial3: true,
    ),
    // ignore: deprecated_member_use
    localizationsDelegates: GlobalMaterialLocalizations.delegates,
    supportedLocales: const [Locale('en'), Locale('de'), Locale('ar')],
    routerConfig: router,
    builder: DevpulApp.builder,
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
    // No adapter: shows with "HTTP without an adapter" on in the UI.
    if (!kIsWeb) ('HttpClient GET', () => _run(_plainGet)),
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
        final items = [
          for (var i = 0; i < 8; i++) {'sku': 'sku-$i', 'qty': i + 1},
        ];
        developer.log('Cart loaded: ${jsonEncode(items)}', name: 'cart');
      },
    ),
    ('Open page', () => context.go('/details/42?tab=info')),
    ('Flutter error', () => throw StateError('Button handler failed')),
    (
      'Build error',
      () => Navigator.of(
        context,
      ).push(MaterialPageRoute<void>(builder: (_) => const ReceiptPage())),
    ),
    (
      'Async error',
      () => Future<void>.delayed(
        Duration.zero,
        () => throw const FormatException('Bad payload from sync job'),
      ),
    ),
    ('Save secrets', _saveSecrets),
    if (!kIsWeb)
      (
        'SQLite: add order',
        () => shop?.insert('order', _order(Random().nextInt(1000))),
      ),
    if (!kIsWeb) ('Write files', _writeFiles),
    ('WebSocket: send', _sendSocket),
    ('WebSocket: close', _closeSocket),
    if (!kIsWeb) ('Notification: show', _showNotification),
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

class ReceiptPage extends StatelessWidget {
  const ReceiptPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title: const Text('Receipt')),
    body: const ReceiptTotal(),
  );
}

class ReceiptTotal extends StatelessWidget {
  const ReceiptTotal({super.key});

  @override
  Widget build(BuildContext context) =>
      throw StateError('Receipt has no total');
}
