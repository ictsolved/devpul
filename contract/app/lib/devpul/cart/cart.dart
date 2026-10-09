import 'package:devpul/devpul.dart';

/// Sends cart changes to the Cart tab.
abstract final class DevpulCart {
  static void changed(List<String> items, double total) =>
      Devpul.emit('cart.updated', {'items': items.length, 'total': total});
}
