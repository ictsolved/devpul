#!/bin/sh
set -e
cd "$(dirname "$0")/.."

flutter pub get
dart format --output=none --set-exit-if-changed packages plugins examples contract tool apps/docs/samples
dart analyze --fatal-infos
for app in contract/app examples/devpul_example; do
  (cd $app && dart ../../packages/devpul_cli/bin/devpul.dart sync --check)
done
for p in devpul devpul_dio devpul_http devpul_cli; do
  (cd packages/$p && dart test)
done
(cd packages/devpul && dart test -p chrome)
(cd packages/devpul_flutter && flutter test)
