import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SETUP = `dependencies:
  devpul: ^0.1.0
  devpul_dio: ^0.1.0      # Dio
  devpul_flutter: ^0.1.0  # Flutter error hooks`;

const MAIN = `import 'package:devpul/devpul.dart';
import 'package:devpul_dio/devpul_dio.dart';
import 'package:devpul_flutter/devpul_flutter.dart';

void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0', 'env': 'dev'});
  dio.interceptors.add(DevpulDioInterceptor());
  runApp(const MyApp());
}`;

const EMIT = `Devpul.emit('cart.updated', {'items': 3, 'total': 42.5});
Devpul.tags['user'] = 'guest';      // added to every event
Devpul.error(error, stack, source: 'sync');`;

const VSCODE = `"dart.flutterRunAdditionalArgs": [
  "--dds-port=8181",
  "--disable-service-auth-codes"
]`;

const PLUGIN = `export default {
  id: 'cart',
  label: 'Cart',
  kinds: ['cart.updated'],
  summarize: (e) => \`\${e.data.items} items\`,
  render(el, e) {
    el.textContent = \`Total: \${e.data.total}\`;
  },
};`;

export function HelpDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog help" onClose={onClose} aria-label="Help">
      <div className="dialog-head">
        <h2>Help</h2>
        <button type="button" className="btn small icon" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <div className="dialog-body">
        <H>Setup</H>
        <p>Add the packages to the app. They only emit in debug builds.</p>
        <Code>{SETUP}</Code>
        <Code>{MAIN}</Code>
        <p>
          Run the app with <code>flutter run</code> or <code>dart run --observe</code> and paste the
          VM service URL it prints (<code>http://127.0.0.1:PORT/TOKEN=/</code>) into the bar above.
          DevTools links and <code>ws://</code> URLs work too. Add one URL per app to watch several
          at once.
        </p>

        <H>Fixed URL (optional)</H>
        <p>
          The port and token change on every run. To keep one URL, run with{' '}
          <code>--dds-port=8181 --disable-service-auth-codes</code> and use{' '}
          <code>ws://127.0.0.1:8181/ws</code>. In VS Code, add this to settings:
        </p>
        <Code>{VSCODE}</Code>
        <p>
          Without the token, any local process or web page can connect to the debug service while
          the app runs. <code>flutter attach</code> and Flutter web always use a token.
        </p>

        <H>Custom events</H>
        <Code>{EMIT}</Code>
        <p>
          Unknown kinds show in Events. <code>Devpul.session</code> takes any fields; pick which
          ones the header shows in Settings.
        </p>

        <H>Filtering</H>
        <ul>
          <li>Words are ANDed. <code>-word</code> excludes. Matches URL, id and bodies.</li>
          <li>Chips filter by status, method, tag and app run.</li>
          <li>Pause freezes the list; rows already shown still update.</li>
        </ul>

        <H>Shortcuts</H>
        <ul className="keys">
          <li>
            <kbd>/</kbd> focus filter
          </li>
          <li>
            <kbd>↑</kbd> <kbd>↓</kbd> or <kbd>k</kbd> <kbd>j</kbd> move selection
          </li>
          <li>
            <kbd>Esc</kbd> close detail
          </li>
          <li>
            <kbd>?</kbd> this help
          </li>
        </ul>

        <H>Plugins</H>
        <p>
          A plugin adds a tab for event kinds. Host an ES module and add its URL in Settings, or
          call <code>window.devpul.register(plugin)</code>. Plugins run with full access to this
          page and its data; load only code you trust.
        </p>
        <Code>{PLUGIN}</Code>

        <H>Troubleshooting</H>
        <ul>
          <li>Grey dot: the URL is from an earlier run. Paste the new one.</li>
          <li>
            Hosted page: allow the browser prompt for apps on this device (Chrome, Firefox). Safari
            blocks it; run <code>npx devpul</code> or open the downloaded file.
          </li>
          <li>
            Missing early events after <code>flutter attach</code>: they are fetched from the
            app&apos;s own buffer on connect, up to <code>backlogSize</code>.
          </li>
          <li>Release and profile builds never emit.</li>
        </ul>
      </div>
    </dialog>
  );
}

const H = ({ children }: { children: ReactNode }) => <h3>{children}</h3>;
const Code = ({ children }: { children: string }) => <pre className="code">{children}</pre>;
