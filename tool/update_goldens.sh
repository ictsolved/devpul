#!/bin/sh
# Rewrites contract/ from the Dart packages, then the session file from those.
set -e
cd "$(dirname "$0")/.."

export DEVPUL_UPDATE_GOLDENS=1
(cd packages/devpul && dart test test/contract_test.dart test/vm_service_test.dart)
(cd packages/devpul_flutter && flutter test test/contract_test.dart)
(cd packages/devpul_cli && dart test test/contract_test.dart test/authoring_test.dart)
(cd apps/ui && npx vitest run src/core/contract.test.ts)
