// Names the samples use without defining them.

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

final class Cache {
  Future<int> clear() async => 0;
}

final cache = Cache();

final class Cart {
  List<String> get items => [];
  void seed(num items, {required bool clear}) {}
  void remove(String sku) {}
}

final cart = Cart();

final class Auth {
  Future<void> signInAs(String role) async {}
}

final auth = Auth();

final class Flags {
  Map<String, bool> toJson() => {};
  void set(String name, {required bool on}) {}
}

final flags = Flags();

Future<void> sync() async {}

final cartProvider = Provider((ref) => cart);

sealed class CartEvent {}

final class CartCleared extends CartEvent {}

final class CartBloc extends Bloc<CartEvent, int> {
  CartBloc() : super(0) {
    on<CartCleared>((event, emit) => emit(0));
  }
}

final class MyObserver extends BlocObserver {}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) => const SizedBox();
}

typedef App = MyApp;
typedef Home = MyApp;
typedef HomePage = MyApp;
typedef CartPage = MyApp;
