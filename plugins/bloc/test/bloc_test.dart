import 'package:bloc/bloc.dart';
import 'package:devpul/devpul.dart';
// ignore: implementation_imports
import 'package:devpul/src/devpul.dart' show debugOnPost;
import 'package:test/test.dart';

import '../bloc.dart';

final _url = Uri.parse('https://example.com/cart');

final class _Add {
  const _Add(this.sku);

  final String sku;

  @override
  String toString() => 'Add($sku)';
}

final class _Cart extends Bloc<Object, int> {
  _Cart() : super(0) {
    on<_Add>((event, emit) async {
      await Future<void>.delayed(Duration.zero);
      DevpulHttp.request(method: 'POST', url: _url);
      emit(state + 1);
    });
    on<String>((event, emit) {
      DevpulHttp.request(method: 'GET', url: _url);
    });
  }
}

void main() {
  final events = <(String, Map<String, Object?>, int)>[];

  setUpAll(DevpulBloc.install);

  setUp(() {
    Devpul.configure(const DevpulConfig(console: ConsoleMode.off));
    events.clear();
    debugOnPost = (kind, event) => events.add((
      kind,
      event['data']! as Map<String, Object?>,
      event['seq']! as int,
    ));
  });

  test('calls a handler makes name the event it handles', () async {
    final cart = _Cart();
    addTearDown(cart.close);
    cart
      ..add(const _Add('a'))
      ..add(const _Add('b'));
    await pumpEventQueue();
    final added = [
      for (final e in events)
        if (e.$1 == 'bloc.event') e.$3,
    ];
    final causes = [
      for (final e in events)
        if (e.$1 == 'http.request') e.$2['cause'],
    ];
    expect(added, hasLength(2));
    expect(causes, [
      for (final seq in added)
        {'type': 'event', 'kind': 'bloc.event', 'seq': seq},
    ]);
  });

  test('string events run without a cause', () async {
    final cart = _Cart();
    addTearDown(cart.close);
    cart.add('refresh');
    await pumpEventQueue();
    final request = events.firstWhere((e) => e.$1 == 'http.request').$2;
    expect(request.containsKey('cause'), false);
  });
}
