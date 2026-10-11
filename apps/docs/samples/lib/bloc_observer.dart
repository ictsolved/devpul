import 'package:devpul/devpul.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

class DevpulBlocObserver extends BlocObserver {
  @override
  void onEvent(Bloc<dynamic, dynamic> bloc, Object? event) {
    super.onEvent(bloc, event);
    Devpul.emit('bloc.event', {'bloc': '${bloc.runtimeType}', 'event': event});
  }

  @override
  void onChange(BlocBase<dynamic> bloc, Change<dynamic> change) {
    super.onChange(bloc, change);
    Devpul.emit('bloc.change', {
      'bloc': '${bloc.runtimeType}',
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
}
