import 'package:devpul_contract_app/devpul/plugins.dart';

void main() {
  DevpulPlugins.install();
  DevpulCart.changed(['tea'], 4.5);
}
