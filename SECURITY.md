# Security

DevPul reads events from the Dart VM service of a debug build. Things to know:

- The VM service binds to 127.0.0.1. Its URL token is the only access check. Running with `--disable-service-auth-codes` lets any local process, and any web page open in your browser, connect while the app runs.
- Events contain whatever the app sends, including tokens and personal data in headers and bodies. Use `redactHeaders` and `redactBody` when that matters, for example when sharing a screen.
- The UI runs only in your browser and sends nothing anywhere. It stores events in IndexedDB; clear them in Settings.
- HAR and session exports contain everything the app sent.
- `Devpul.action` handlers and service extensions run in the app when called from the UI, and by anything else that can reach the VM service.
- UI plugins loaded by URL run with full access to the page.
- Release and profile builds never emit.

Report vulnerabilities privately through GitHub security advisories on this repository.
