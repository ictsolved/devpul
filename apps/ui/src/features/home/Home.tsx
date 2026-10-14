import { FolderOpen, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { codeClass } from '../../components/JsonView';
import { onSite, pageUrl, repoUrl } from '../../lib/links';

interface Props {
  icon: string;
  connect: ReactNode;
  tools: ReactNode;
  waiting: boolean;
  onOpenFile: () => void;
  onOpenPlugins: () => void;
}

// index.html repeats these for the page before the script runs.
const HOME_MAIN = 'mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center gap-1 px-4 pt-[6vh] pb-6 text-center';
const HOME_TITLE = 'mt-2 text-[30px] font-bold';
const HOME_LEAD = 'mt-1 mb-5 max-w-[520px] text-base text-muted-foreground';
const HOME_HINT = 'mt-2.5 text-[13px] text-muted-foreground';
const HOME_PRIVACY =
  'mt-[18px] flex max-w-[560px] items-start gap-1.5 rounded-lg border bg-card px-3 py-2 text-left text-[12.5px]';

const SETUP = `dependencies:
  devpul: ^1.0.0-dev.1
  devpul_dio: ^1.0.0-dev.1      # Dio, or devpul_http for package:http
  devpul_flutter: ^1.0.0-dev.1  # Flutter errors and routes`;

const MAIN = `void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0'});
  dio.interceptors.add(DevpulDioInterceptor());
  runApp(const MyApp());
}`;

const NAV_LINK = 'text-muted-foreground hover:text-foreground';
const SNIPPET = `${codeClass} mt-1.5 overflow-x-auto whitespace-pre`;
const STEP = 'my-3';
const SHOT = 'mb-6 w-full rounded-lg border';

export function Home({ icon, connect, tools, waiting, onOpenFile, onOpenPlugins }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-end gap-3.5 px-4 py-2.5">
        <a className={NAV_LINK} href={pageUrl('docs/')}>
          Docs
        </a>
        <button type="button" className={`${NAV_LINK} cursor-pointer`} onClick={onOpenPlugins}>
          Plugins
        </button>
        <a className={NAV_LINK} href={pageUrl('docs/help/')}>
          Help
        </a>
        <a className={NAV_LINK} href={repoUrl}>
          GitHub
        </a>
        {tools}
      </header>
      {onSite ? (
        <main className={HOME_MAIN}>
          <img src={icon} alt="" width={44} height={44} />
          <h1 className={HOME_TITLE}>DevPul</h1>
          <p className={HOME_LEAD}>
            HTTP calls, errors, logs and events from a running Dart or Flutter app, live in your browser.
          </p>
          <img
            className={`${SHOT} dark:hidden`}
            src="./screenshots/session-light.webp"
            alt="DevPul connected to a running app: requests arrive, a request opens with its headers and bodies, then an error shows"
            width={1440}
            height={900}
          />
          <img
            className={`${SHOT} hidden dark:block`}
            src="./screenshots/session-dark.webp"
            alt="DevPul connected to a running app: requests arrive, a request opens with its headers and bodies, then an error shows"
            width={1440}
            height={900}
            loading="lazy"
          />
          <ol className="w-full list-decimal pl-5 text-left">
            <li className={STEP}>
              Add the packages:
              <pre className={SNIPPET}>{SETUP}</pre>
              <pre className={SNIPPET}>{MAIN}</pre>
            </li>
            <li className={STEP}>
              Install the CLI:
              <pre className={SNIPPET}>dart pub global activate devpul_cli</pre>
            </li>
            <li className={STEP}>
              Run <code>devpul run</code> in place of <code>flutter run</code>, or open the DevPul tab in DevTools from
              your IDE.
            </li>
          </ol>
          <button
            type="button"
            className="mb-4 inline-flex cursor-pointer items-center gap-1 text-primary"
            onClick={onOpenFile}
          >
            <FolderOpen size={14} /> Open a session file
          </button>
          <p className="mb-1.5 text-[13px] text-muted-foreground">
            Dart 3.13 and older: paste a VM service URL to connect from this site.
          </p>
          {connect}
          {waiting && <p className={HOME_HINT}>Connected. Waiting for the first event.</p>}
          <p className={HOME_PRIVACY}>
            <ShieldCheck size={15} className="mt-px flex-none text-success" />
            <span>
              Runs only in your browser. Requests, headers and bodies go from your app to the tab over 127.0.0.1 and are
              never sent to a server.
            </span>
          </p>
        </main>
      ) : (
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
              Click the DevPul link a debug run prints, or paste its VM service URL. Pasting anywhere on this page works
              too.
            </p>
          )}
          <p className={HOME_PRIVACY}>
            <ShieldCheck size={15} className="mt-px flex-none text-success" />
            <span>
              Runs only in this browser. Requests, headers and bodies go from your app to this tab over 127.0.0.1 and
              are never sent to a server.
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
                Run the app in debug mode and click the DevPul link it prints.{' '}
                <a className="text-primary" href={pageUrl('docs/')}>
                  Full guide
                </a>
              </li>
            </ol>
          </details>
        </main>
      )}
      {!onSite && (
        <footer className="flex flex-wrap justify-center gap-x-[18px] gap-y-2 p-4 text-xs text-muted-foreground">
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 text-primary"
            onClick={onOpenFile}
          >
            <FolderOpen size={13} /> Open a session file
          </button>
          <span>
            or run <code>devpul run</code> in place of <code>flutter run</code>
          </span>
        </footer>
      )}
    </div>
  );
}
