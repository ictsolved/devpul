import 'dart:async';

import 'devpul.dart';

final _key = Object();

/// The cause in the current zone, set by [DevpulCause.run], an action run
/// from the UI or a replay.
Cause? get currentCause => switch (Zone.current[_key]) {
  final Cause cause => cause,
  _ => null,
};

/// What `http.request` carries as `cause`. [started] hears the first call
/// made under it.
final class Cause {
  Cause(this.json, {this.started});

  final Map<String, Object?> json;
  void Function(Object id)? started;

  R run<R>(R Function() body) => runZoned(body, zoneValues: {_key: this});
}

/// An event that HTTP calls can name as their cause: calls made inside
/// [run], and in the work it starts, link to it in the UI.
///
/// ```dart
/// DevpulCause('cart.checkout', {'items': 3}).run(() => api.checkout(cart));
/// ```
final class DevpulCause {
  /// Posts [kind] with [data] as [Devpul.emit] does.
  DevpulCause(String kind, Map<String, Object?> data)
    : _cause = Devpul.enabled
          ? Cause({'type': 'event', 'kind': kind, 'seq': ?emitSeq(kind, data)})
          : null;

  final Cause? _cause;

  R run<R>(R Function() body) {
    final cause = _cause;
    return cause == null ? body() : cause.run(body);
  }
}
