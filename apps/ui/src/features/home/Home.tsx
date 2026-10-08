import { FolderOpen, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { codeClass } from '../../components/JsonView';
import { pageUrl, repoUrl } from '../../lib/links';

interface Props {
  icon: string;
  connect: ReactNode;
  tools: ReactNode;
  waiting: boolean;
  onOpenFile: () => void;
}

// index.html repeats these for the page before the script runs.
const HOME_MAIN = 'mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center gap-1 px-4 pt-[6vh] pb-6 text-center';
const HOME_TITLE = 'mt-2 text-[30px] font-bold';
const HOME_LEAD = 'mt-1 mb-5 max-w-[520px] text-base text-muted-foreground';
const HOME_HINT = 'mt-2.5 text-[13px] text-muted-foreground';
const HOME_PRIVACY =
  'mt-[18px] flex max-w-[560px] items-start gap-1.5 rounded-lg border bg-card px-3 py-2 text-left text-[12.5px]';

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

const NAV_LINK = 'text-muted-foreground hover:text-foreground';
const SNIPPET = `${codeClass} mt-1.5 overflow-x-auto whitespace-pre`;

export function Home({ icon, connect, tools, waiting, onOpenFile }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-end gap-3.5 px-4 py-2.5">
        <a className={NAV_LINK} href={pageUrl('docs/')}>
          Docs
        </a>
        <a className={NAV_LINK} href={pageUrl('docs/plugins/')}>
          Plugins
        </a>
        <a className={NAV_LINK} href={pageUrl('help/')}>
          Help
        </a>
        <a className={NAV_LINK} href={repoUrl}>
          GitHub
        </a>
        {tools}
      </header>
      <main className={HOME_MAIN}>
        <img src={icon} alt="" width={44} height={44} />
        <h1 className={HOME_TITLE}>DevPul</h1>
        <p className={HOME_LEAD}>
          HTTP calls, errors, logs and events from a running Dart or Flutter app, live in your browser.
        </p>
        {connect}
        {waiting ? (
          <p className={HOME_HINT}>
            Connected. Waiting for the first event; make sure the app calls DevPul in a debug build.
          </p>
        ) : (
          <p className={HOME_HINT}>
            Run <code>flutter run</code> and paste the VM service URL it prints. Pasting anywhere on this page works
            too.
          </p>
        )}
        <p className={HOME_PRIVACY}>
          <ShieldCheck size={15} className="mt-px flex-none text-success" />
          <span>
            Runs only in this browser. Requests, headers and bodies go from your app to this tab over 127.0.0.1 and are
            never sent to a server.
          </span>
        </p>
        <details className="mt-[18px] w-full text-left">
          <summary className="cursor-pointer text-center text-primary">First time? Set up the app</summary>
          <ol className="list-decimal pl-5">
            <li className="my-2.5">
              Add the packages:
              <pre className={SNIPPET}>{SETUP}</pre>
            </li>
            <li className="my-2.5">
              Hook them up:
              <pre className={SNIPPET}>{MAIN}</pre>
            </li>
            <li className="my-2.5">
              Run the app in debug mode and paste the URL above.{' '}
              <a className="text-primary" href={pageUrl('docs/')}>
                Full guide
              </a>
            </li>
          </ol>
        </details>
      </main>
      <footer className="flex flex-wrap justify-center gap-x-[18px] gap-y-2 p-4 text-xs text-muted-foreground">
        <button
          type="button"
          className="inline-flex cursor-pointer items-center gap-1 text-primary"
          onClick={onOpenFile}
        >
          <FolderOpen size={13} /> Open a session file
        </button>
        <span>
          or run <code>npx devpul</code>
        </span>
      </footer>
    </div>
  );
}
