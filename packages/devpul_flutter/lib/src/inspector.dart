import 'package:flutter/widgets.dart';

/// Whether the app runs with `--track-widget-creation` (debug default).
bool get creationTracked =>
    WidgetInspectorService.instance.isWidgetCreationTracked();

bool _local(Element element) => debugIsWidgetLocalCreation(element.widget);

/// [element] or its nearest ancestor created in the app's code: the widget
/// Flutter's console names as the relevant error-causing widget.
Element? localAncestor(Element element) {
  if (_local(element)) return element;
  Element? found;
  element.visitAncestorElements((e) {
    if (_local(e)) found = e;
    return found == null;
  });
  return found;
}

/// The first widget under [root], depth first, created in the app's code.
Element? localDescendant(Element root) {
  Element? found;
  void visit(Element e) {
    if (found != null) return;
    if (_local(e)) {
      found = e;
    } else {
      e.visitChildElements(visit);
    }
  }

  root.visitChildElements(visit);
  return found;
}

/// The topmost widget created in the app's code on the path from [root]
/// down to [element]. While [root] builds for the first time its children
/// are not linked yet, so only the path up from a building element shows.
Element? localOnPath(Element root, Element element) {
  final path = [element];
  var under = false;
  element.visitAncestorElements((e) {
    under = e == root;
    if (!under) path.add(e);
    return !under;
  });
  return under ? path.reversed.where(_local).firstOrNull : null;
}

/// Where [element]'s widget was constructed. Only the inspector's JSON
/// exposes it.
({String file, int line, int column})? creationLocation(Element element) {
  final json = element.widget.toDiagnosticsNode().toJsonMap(
    // ignore: invalid_use_of_visible_for_testing_member
    InspectorSerializationDelegate(
      service: WidgetInspectorService.instance,
      subtreeDepth: 0,
    ),
  );
  return switch (json['creationLocation']) {
    {
      'file': final String file,
      'line': final int line,
      'column': final int column,
    } =>
      (file: file, line: line, column: column),
    _ => null,
  };
}
