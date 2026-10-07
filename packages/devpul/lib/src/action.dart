/// A field in the form the UI shows before running an action.
final class DevpulParam {
  const DevpulParam.text(this.name, {String this.initial = ''})
    : type = 'text',
      options = const [];

  const DevpulParam.number(this.name, {num this.initial = 0})
    : type = 'number',
      options = const [];

  const DevpulParam.flag(this.name, {bool this.initial = false})
    : type = 'flag',
      options = const [];

  /// [initial] defaults to the first option.
  const DevpulParam.choice(this.name, this.options, {String? this.initial})
    : type = 'choice';

  final String name;

  /// `text`, `number`, `flag` or `choice`.
  final String type;

  final Object? initial;
  final List<String> options;

  Object? get _initial => initial ?? (options.isEmpty ? null : options.first);

  Map<String, Object?> toJson() => {
    'name': name,
    'type': type,
    'initial': _initial,
    if (type == 'choice') 'options': options,
  };

  /// [value] as this param's type, or the initial value when null.
  Object? read(Object? value) {
    if (value == null) return _initial;
    final ok = switch (type) {
      'text' => value is String,
      'number' => value is num,
      'flag' => value is bool,
      _ => options.contains(value),
    };
    if (!ok) throw ArgumentError.value(value, name, 'not a valid $type');
    return value;
  }
}
