import 'package:devpul/devpul.dart';
// ignore: deprecated_member_use
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'riverpod_observer.dart';
import 'stubs.dart';

void clearCache() {
  Devpul.action('Clear cache', (_) async {
    final n = await cache.clear();
    return 'removed $n entries';
  });
}

void params() {
  Devpul.action(
    'Seed cart',
    (args) => cart.seed(args['items']! as num, clear: args['clear']! as bool),
    params: const [
      DevpulParam.number('items', initial: 3),
      DevpulParam.flag('clear'),
    ],
  );
  Devpul.action(
    'Sign in as',
    (args) => auth.signInAs(args['role']! as String),
    params: const [
      DevpulParam.choice('role', ['guest', 'member', 'admin']),
    ],
  );
}

void riverpod() {
  final container = ProviderContainer(observers: [DevpulProviderObserver()]);
  Devpul.action('Reset cart', (_) => container.invalidate(cartProvider));
  runApp(UncontrolledProviderScope(container: container, child: const MyApp()));
}

class CartScreen extends StatelessWidget {
  const CartScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocProvider(
      create: (_) {
        final bloc = CartBloc();
        Devpul.action('Empty cart', (_) => bloc.add(CartCleared()));
        return bloc;
      },
      child: const CartPage(),
    );
  }
}
