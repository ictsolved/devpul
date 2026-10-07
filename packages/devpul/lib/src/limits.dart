/// Per-kind caps on events per second. A limit on `http` covers
/// `http.request` and the other `http.` kinds; the longest match wins.
final class Limits {
  final _perSecond = <String, int>{};
  final _windows = <String, (int, int)>{};
  final dropped = <String, int>{};

  Map<String, int> get all => Map.unmodifiable(_perSecond);

  /// 0 mutes [kind], null removes its limit.
  void set(String kind, int? perSecond) {
    _windows.remove(kind);
    if (perSecond == null) {
      _perSecond.remove(kind);
    } else {
      _perSecond[kind] = perSecond < 0 ? 0 : perSecond;
    }
  }

  /// Whether an event of [kind] at [now] milliseconds may go out.
  bool allow(String kind, int now) {
    if (_perSecond.isEmpty) return true;
    String? match;
    for (final k in _perSecond.keys) {
      if ((kind == k || kind.startsWith('$k.')) &&
          (match == null || k.length > match.length)) {
        match = k;
      }
    }
    if (match == null) return true;
    final max = _perSecond[match]!;
    final (start, count) = _windows[match] ?? (now, 0);
    final (s, c) = now - start >= 1000 ? (now, 0) : (start, count);
    if (c >= max) {
      _windows[match] = (s, c);
      dropped[match] = (dropped[match] ?? 0) + 1;
      return false;
    }
    _windows[match] = (s, c + 1);
    return true;
  }
}
