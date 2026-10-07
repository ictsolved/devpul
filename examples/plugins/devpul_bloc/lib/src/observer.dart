import 'dart:convert';
import 'dart:developer' as developer;

import 'package:bloc/bloc.dart';
import 'package:devpul/devpul.dart';

import 'plugin.dart';

/// Sends bloc and cubit changes to DevPul and offers the UI a Bloc tab.
///
/// ```dart
/// Bloc.observer = DevpulBlocObserver();
/// ```
class DevpulBlocObserver extends BlocObserver {
  DevpulBlocObserver() {
    if (_ready || !Devpul.enabled) return;
    _ready = true;
    Devpul.plugin('devpul_bloc', () => blocPlugin);
    try {
      developer.registerExtension('ext.devpul_bloc.state', (_, _) async {
        final blocs = [
          for (final bloc in _live) {..._key(bloc), 'value': bloc.state},
        ];
        return developer.ServiceExtensionResponse.result(
          jsonEncode({'blocs': toJsonSafe(blocs)}),
        );
      });
    } catch (_) {
      // Already registered in this isolate.
    }
  }

  static bool _ready = false;
  static final _live = <BlocBase<Object?>>{};

  @override
  void onCreate(BlocBase<dynamic> bloc) {
    super.onCreate(bloc);
    _live.add(bloc);
    Devpul.emit('bloc.create', {..._key(bloc), 'state': bloc.state});
  }

  @override
  void onEvent(Bloc<dynamic, dynamic> bloc, Object? event) {
    super.onEvent(bloc, event);
    Devpul.emit('bloc.event', {..._key(bloc), 'event': event});
  }

  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    Devpul.emit('bloc.change', {
      ..._key(bloc),
      'previous': change.currentState,
      'next': change.nextState,
    });
  }

  @override
  void onError(BlocBase<dynamic> bloc, Object error, StackTrace stackTrace) {
    Devpul.error(
      error,
      stackTrace,
      source: 'bloc',
      context: '${bloc.runtimeType}',
    );
    super.onError(bloc, error, stackTrace);
  }

  @override
  void onClose(BlocBase<dynamic> bloc) {
    super.onClose(bloc);
    _live.remove(bloc);
    Devpul.emit('bloc.close', _key(bloc));
  }

  // Two blocs of one type need an id to tell them apart.
  static Map<String, String> _key(BlocBase<dynamic> bloc) => {
    'bloc': '${bloc.runtimeType}',
    'id': identityHashCode(bloc).toRadixString(36),
  };
}
