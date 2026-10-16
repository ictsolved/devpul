import { FolderOpen, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { CopyButton } from '../../components/Copy';
import { codeClass } from '../../components/JsonView';
import { marketUrl, onSite, pageUrl, repoUrl } from '../../lib/links';

interface Props {
  icon: string;
  connect: ReactNode;
  tools: ReactNode;
  waiting: boolean;
  onOpenFile: () => void;
  /** Opens the Plugins view; on the site only while plugins are allowed, the header's Plugins being the marketplace. */
  onOpenPlugins?: () => void;
}

// index.html repeats these for the page before the script runs.
const HOME_MAIN = 'mx-auto flex w-full max-w-[680px] flex-1 flex-col items-center gap-1 px-4 pt-[6vh] pb-6 text-center';
const HOME_TITLE = 'mt-2 text-[30px] font-bold';
const HOME_LEAD = 'mt-1 mb-5 max-w-[520px] text-base text-muted-foreground';
const HOME_HINT = 'mt-2.5 text-[13px] text-muted-foreground';
const HOME_PRIVACY =
  'mt-[18px] flex max-w-[560px] items-start gap-1.5 rounded-lg border bg-card px-3 py-2 text-left text-[12.5px]';

const SETUP = `dependencies:
  devpul: ^1.0.0
  devpul_dio: ^1.0.0      # Dio, or devpul_http for package:http
  devpul_flutter: ^1.0.0  # Flutter errors and routes`;

const MAIN = `void main() {
  DevpulFlutter.install();
  Devpul.session({'name': 'My app', 'version': '1.0.0'});
  dio.interceptors.add(DevpulDioInterceptor());
  runApp(const MyApp());
}`;

const INSTALL = 'dart pub global activate devpul_cli';

const FEATURES = [
  {
    title: 'HTTP',
    text: 'Requests from Dio, package:http or dart:io, with headers, bodies and timing.',
    page: 'docs/ui/',
  },
  {
    title: 'Errors',
    text: 'Stack traces and diagnostics, with the routes, logs and requests just before.',
    page: 'docs/flutter/#errors',
  },
  {
    title: 'Logs',
    text: 'Devpul.log, developer.log and debugPrint, with level and logger filters.',
    page: 'docs/api/#logs',
  },
  {
    title: 'Plugins',
    text: 'Tabs for app state, storage, databases and your own events.',
    page: 'docs/plugins/install/',
  },
  { title: 'MCP', text: 'The same requests, logs, errors and actions for coding agents.', page: 'docs/mcp/' },
];

const NAV_LINK = 'text-muted-foreground hover:text-foreground';
const SNIPPET = `${codeClass} mt-1.5 overflow-x-auto whitespace-pre`;
// The cards scroll their code sideways; the packaged home wraps it.
const CARD_SNIPPET = cn(codeClass, 'mt-1.5 overflow-x-auto whitespace-pre wrap-normal');
const SHOT = 'w-full rounded-lg border';
const SHOT_ALT =
  'DevPul connected to a running app: requests arrive, a request opens with its headers and bodies, then an error shows';
const HEADING = 'mb-3 text-lg font-semibold';
const CARD = 'rounded-lg border bg-card p-4';
const CARD_TITLE = 'font-semibold';

export function Home({ icon, connect, tools, waiting, onOpenFile, onOpenPlugins }: Props) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-end gap-3.5 px-4 py-2.5">
        <a className={NAV_LINK} href={pageUrl('docs/')}>
          Docs
        </a>
        {onSite && (
          <a className={NAV_LINK} href={marketUrl}>
            Plugins
          </a>
        )}
        {onOpenPlugins && (
          <button type="button" className={`${NAV_LINK} cursor-pointer`} onClick={onOpenPlugins}>
            {onSite ? 'My plugins' : 'Plugins'}
          </button>
        )}
        <a className={NAV_LINK} href={pageUrl('docs/help/')}>
          Help
        </a>
        <a className={NAV_LINK} href={repoUrl}>
          GitHub
        </a>
        {tools}
      </header>
      {onSite ? (
        <main className="mx-auto flex w-full max-w-[1360px] flex-1 flex-col gap-12 px-4 pt-[3vh] pb-8 lg:px-8">
          <section className="grid grid-cols-[minmax(0,1fr)] items-center gap-8 lg:grid-cols-[400px_minmax(0,1fr)]">
            <div className="flex flex-col items-start">
              <img src={icon} alt="" width={44} height={44} />
              <h1 className={HOME_TITLE}>DevPul</h1>
              <p className={HOME_LEAD}>
                HTTP calls, errors, logs and events from a running Dart or Flutter app, live in your browser.
              </p>
              <div className="flex w-full max-w-[420px] items-center gap-2 rounded-lg border bg-card py-1.5 pr-1.5 pl-3">
                <code className="min-w-0 flex-1 overflow-x-auto font-mono text-xs whitespace-nowrap sm:text-[13px]">
                  {INSTALL}
                </code>
                <CopyButton text={() => INSTALL} />
              </div>
              <Button asChild className="mt-4">
                <a href={pageUrl('docs/')}>Get started</a>
              </Button>
            </div>
            <div>
              <img
                className={`${SHOT} dark:hidden`}
                src="./screenshots/session-light.webp"
                alt={SHOT_ALT}
                width={1440}
                height={900}
              />
              <img
                className={`${SHOT} hidden dark:block`}
                src="./screenshots/session-dark.webp"
                alt={SHOT_ALT}
                width={1440}
                height={900}
                loading="lazy"
              />
            </div>
          </section>
          <section aria-labelledby="setup">
            <h2 id="setup" className={HEADING}>
              Set up
            </h2>
            <ol className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <li className={CARD}>
                <h3 className={CARD_TITLE}>1. Add the packages</h3>
                <pre className={CARD_SNIPPET}>{SETUP}</pre>
                <pre className={CARD_SNIPPET}>{MAIN}</pre>
              </li>
              <li className={CARD}>
                <h3 className={CARD_TITLE}>2. Install the CLI</h3>
                <pre className={CARD_SNIPPET}>{INSTALL}</pre>
              </li>
              <li className={CARD}>
                <h3 className={CARD_TITLE}>3. Run</h3>
                <pre className={CARD_SNIPPET}>devpul run</pre>
                <p className="mt-2 text-muted-foreground">
                  In place of <code>flutter run</code>, with the same arguments. Or open the DevPul tab in DevTools from
                  your IDE.
                </p>
              </li>
            </ol>
          </section>
          <section aria-labelledby="shows">
            <h2 id="shows" className={HEADING}>
              What it shows
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {FEATURES.map((f) => (
                <li key={f.title}>
                  <a className={`${CARD} block h-full hover:border-primary`} href={pageUrl(f.page)}>
                    <h3 className={CARD_TITLE}>{f.title}</h3>
                    <p className="mt-1 text-muted-foreground">{f.text}</p>
                  </a>
                </li>
              ))}
            </ul>
          </section>
          <footer className="flex flex-col items-center gap-1 border-t pt-8 text-center">
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
            <div className="w-full max-w-[560px]">{connect}</div>
            {waiting && <p className={HOME_HINT}>Connected. Waiting for the first event.</p>}
            <p className={HOME_PRIVACY}>
              <ShieldCheck size={15} className="mt-px flex-none text-success" />
              <span>
                Runs only in your browser. Requests, headers and bodies go from your app to the tab over 127.0.0.1 and
                are never sent to a server.
              </span>
            </p>
          </footer>
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
