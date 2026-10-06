import { FolderOpen, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { pageUrl, repoUrl } from '../lib/links';

interface Props {
  icon: string;
  connect: ReactNode;
  tools: ReactNode;
  waiting: boolean;
  localOrigin: boolean;
  onOpenFile: () => void;
}

const SETUP = `dependencies:
  devpul: ^0.2.0
  devpul_dio: ^0.2.0      # Dio, or devpul_http for package:http
  devpul_flutter: ^0.2.0  # Flutter errors and routes`;

const MAIN = `void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0'});
  dio.interceptors.add(DevpulDioInterceptor());
  runApp(const MyApp());
}`;

export function Home({ icon, connect, tools, waiting, localOrigin, onOpenFile }: Props) {
  return (
    <div className="home">
      <header className="home-nav">
        <a href={pageUrl('docs/')}>Docs</a>
        <a href={pageUrl('docs/plugins/')}>Plugins</a>
        <a href={pageUrl('help/')}>Help</a>
        <a href={repoUrl}>GitHub</a>
        {tools}
      </header>
      <main className="home-main">
        <img src={icon} alt="" width={44} height={44} />
        <h1>DevPul</h1>
        <p className="lead">
          HTTP calls, errors, logs and events from a running Dart or Flutter app, live in your
          browser.
        </p>
        {connect}
        {waiting ? (
          <p className="home-hint">
            Connected. Waiting for the first event; make sure the app calls DevPul in a debug build.
          </p>
        ) : (
          <p className="home-hint">
            Run <code>flutter run</code> and paste the VM service URL it prints. Pasting anywhere
            on this page works too.
          </p>
        )}
        <p className="privacy">
          <ShieldCheck size={15} />
          <span>
            Runs only in this browser. Requests, headers and bodies go from your app to this tab
            over 127.0.0.1 and are never sent to a server.
          </span>
        </p>
        <details className="first-time">
          <summary>First time? Set up the app</summary>
          <ol>
            <li>
              Add the packages:
              <pre className="code">{SETUP}</pre>
            </li>
            <li>
              Hook them up:
              <pre className="code">{MAIN}</pre>
            </li>
            <li>
              Run the app in debug mode and paste the URL above.{' '}
              <a href={pageUrl('docs/')}>Full guide</a>
            </li>
          </ol>
        </details>
      </main>
      <footer className="home-foot">
        <button type="button" className="link" onClick={onOpenFile}>
          <FolderOpen size={13} /> Open a session file
        </button>
        {!localOrigin && (
          <a href="./index.html" download="devpul.html">
            Download as one HTML file
          </a>
        )}
        <span>
          or run <code>npx devpul</code>
        </span>
      </footer>
    </div>
  );
}
