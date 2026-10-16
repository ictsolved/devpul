import 'package:bloc/bloc.dart';
import 'package:devpul/devpul.dart';

/// Sends bloc and cubit changes to DevPul for the Bloc tab.
abstract final class DevpulBloc {
  /// Sets [Bloc.observer] to one that sends every change to DevPul and then
  /// calls the observer set before. Wraps [Bloc.transformer] so that HTTP
  /// calls a handler makes link to the event it handles. Does nothing unless
  /// [Devpul.included].
  static void install() {
    if (!Devpul.included || Bloc.observer is _Observer) return;
    Bloc.observer = _Observer(Bloc.observer);
    final transformer = Bloc.transformer;
    Bloc.transformer = (events, mapper) => transformer(events, (event) {
      final cause = _Observer._causeOf(event);
      return cause == null ? mapper(event) : cause.run(() => mapper(event));
    });
    Devpul.handle(
      'bloc.state',
      (_) => {
        'blocs': [
          for (final bloc in _Observer._live)
            {..._Observer._key(bloc), 'value': bloc.state},
        ],
      },
      description: 'Live blocs and cubits with their current states.',
    );
  }
}

final class _Observer extends BlocObserver {
  _Observer(this._next);

  final BlocObserver _next;

  static final _live = <BlocBase<Object?>>{};
  static final _causes = Expando<DevpulCause>();

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
    final cause = DevpulCause('bloc.event', {..._key(bloc), 'event': event});
    // Expando takes no strings, numbers, booleans, records or null.
    try {
      _causes[event!] = cause;
    } catch (_) {}
    _next.onEvent(bloc, event);
  }

  static DevpulCause? _causeOf(Object? event) {
    try {
      return _causes[event!];
    } catch (_) {
      return null;
    }
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
