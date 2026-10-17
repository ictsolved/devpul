#!/bin/sh
set -e
cd "$(dirname "$0")/.."

flutter pub get
dart format --output=none --set-exit-if-changed packages plugins examples contract tool apps/docs/samples
dart analyze --fatal-infos
# api_summary needs Dart 3.12, above the workspace floor, so it runs as a global tool.
dart pub global list | grep -qx 'api_summary 1.2.0' || dart pub global activate api_summary 1.2.0
for p in devpul devpul_dio devpul_http devpul_flutter devpul_test; do
  dart pub global run api_summary -p packages/$p --check
done
for app in contract/app examples/devpul_example; do
  (cd $app && dart ../../packages/devpul_cli/bin/devpul.dart sync --check)
done
for p in devpul devpul_dio devpul_http devpul_cli devpul_test; do
  (cd packages/$p && dart test)
done
(cd plugins/bloc && dart test)
(cd plugins/sqflite && dart test)
(cd plugins/go_router && flutter test)
(cd packages/devpul && dart test -p chrome)
(cd packages/devpul_flutter && flutter test)
(cd packages/devpul_flutter && flutter test --no-track-widget-creation test/locations_test.dart)
