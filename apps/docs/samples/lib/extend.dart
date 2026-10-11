import 'package:devpul/devpul.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'bloc_observer.dart';
import 'riverpod_observer.dart';
import 'stubs.dart';

void riverpod() {
  runApp(
    ProviderScope(observers: [DevpulProviderObserver()], child: const MyApp()),
  );
}

void main() {
  Bloc.observer = DevpulBlocObserver();
  runApp(const MyApp());
}

void sources(
  String name,
  Map<String, Object?> params,
  Object message,
  String sql,
  List<Object?> args,
  int elapsed,
) {
  Devpul.emit('analytics.event', {'name': name, 'params': params});
  Devpul.emit('ws.message', {'direction': 'in', 'data': message});
  Devpul.emit('db.query', {'sql': sql, 'args': args, 'ms': elapsed});
  Devpul.emit('flags.changed', flags.toJson());
}
