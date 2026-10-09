#!/bin/sh
set -e
cd "$(dirname "$0")/.."

flutter pub get
dart format --output=none --set-exit-if-changed packages examples contract tool
dart analyze --fatal-infos
(cd contract/app && dart ../../packages/devpul_cli/bin/devpul.dart sync --check)
for p in devpul devpul_dio devpul_http devpul_cli; do
  (cd packages/$p && dart test)
done
(cd packages/devpul && dart test -p chrome)
(cd packages/devpul_flutter && flutter test)
