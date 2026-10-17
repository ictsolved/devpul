#!/bin/sh
# Rewrites contract/ from the Dart packages, then the session file from those, then api.txt.
set -e
cd "$(dirname "$0")/.."

export DEVPUL_UPDATE_GOLDENS=1
(cd packages/devpul && dart test test/contract_test.dart test/vm_service_test.dart)
(cd packages/devpul_flutter && flutter test test/contract_test.dart)
(cd packages/devpul_cli && dart test test/contract_test.dart test/authoring_test.dart test/mcp_test.dart)
(cd packages/devpul_test && dart test test/capture_test.dart)
(cd apps/ui && npx vitest run src/core/contract.test.ts)
dart pub global list | grep -qx 'api_summary 1.2.0' || dart pub global activate api_summary 1.2.0
for p in devpul devpul_dio devpul_http devpul_flutter devpul_test; do
  dart pub global run api_summary -p packages/$p --write
done
