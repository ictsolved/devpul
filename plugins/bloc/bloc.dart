import 'package:bloc/bloc.dart';
import 'package:devpul/devpul.dart';

/// Sends bloc and cubit changes to DevPul for the Bloc tab.
abstract final class DevpulBloc {
  /// Sets [Bloc.observer] to one that sends every change to DevPul and then
  /// calls the observer set before. Does nothing unless [Devpul.included].
  static void install() {
    if (!Devpul.included || Bloc.observer is _Observer) return;
    Bloc.observer = _Observer(Bloc.observer);
    Devpul.handle(
      'bloc.state',
      (_) => {
        'blocs': [
          for (final bloc in _Observer._live)
            {..._Observer._key(bloc), 'value': bloc.state},
        ],
      },
    );
  }
}

final class _Observer extends BlocObserver {
  _Observer(this._next);

  final BlocObserver _next;

  static final _live = <BlocBase<Object?>>{};

  @override
  void onCreate(BlocBase<dynamic> bloc) {
    super.onCreate(bloc);
    _live.add(bloc);
    Devpul.emit('bloc.create', {..._key(bloc), 'state': bloc.state});
    _next.onCreate(bloc);
  }

  @override
  void onEvent(Bloc<dynamic, dynamic> bloc, Object? event) {
    super.onEvent(bloc, event);
    Devpul.emit('bloc.event', {..._key(bloc), 'event': event});
    _next.onEvent(bloc, event);
  }

  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    Devpul.emit('bloc.change', {
      ..._key(bloc),
      'previous': change.currentState,
      'next': change.nextState,
    });
    _next.onChange(bloc, change);
  }

  @override
  void onTransition(
    Bloc<dynamic, dynamic> bloc,
    Transition<dynamic, dynamic> transition,
  ) {
    super.onTransition(bloc, transition);
    _next.onTransition(bloc, transition);
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
    _next.onError(bloc, error, stackTrace);
  }

  @override
  void onDone(
    Bloc<dynamic, dynamic> bloc,
    Object? event, [
    Object? error,
    StackTrace? stackTrace,
  ]) {
    super.onDone(bloc, event, error, stackTrace);
    _next.onDone(bloc, event, error, stackTrace);
  }

  @override
  void onClose(BlocBase<dynamic> bloc) {
    super.onClose(bloc);
    _live.remove(bloc);
    Devpul.emit('bloc.close', _key(bloc));
    _next.onClose(bloc);
  }

  // Two blocs of one type need an id to tell them apart.
  static Map<String, String> _key(BlocBase<dynamic> bloc) => {
    'bloc': '${bloc.runtimeType}',
    'id': identityHashCode(bloc).toRadixString(36),
  };
}
