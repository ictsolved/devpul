#!/usr/bin/env node
console.error(`The devpul command moved to Dart. Install it with:

  npm uninstall -g devpul
  dart pub global activate devpul_cli

Both install a devpul command, so remove this one first. Then:

  devpul run          # flutter run with DevPul connected
  devpul              # the UI on http://127.0.0.1:7171`);
process.exit(1);
