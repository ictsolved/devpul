import { CircleHelp, Download, FileDown, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { version } from '../package.json';
import { ActionsMenu, type AppActions } from './components/ActionsMenu';
import { ConnectionBar, type ConnEntry } from './components/ConnectionBar';
import { ErrorsTab } from './components/ErrorsTab';
import { EventsTab } from './components/EventsTab';
import { Home } from './components/Home';
import { HttpTab } from './components/HttpTab';
import { LogsTab } from './components/LogsTab';
import { Menu, MenuItem } from './components/Menu';
import { type AppCall, PluginTab } from './components/PluginTab';
import { SessionHeader, sessionFields } from './components/SessionHeader';
import { SettingsDialog } from './components/SettingsDialog';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ThemeToggle } from './components/ThemeToggle';
import { Tooltip } from './components/Tooltip';
import { type DevEvent, str } from './lib/events';
import { download, fromSession, toHar, toSession } from './lib/export';
import { formatTime } from './lib/json';
import { pageUrl } from './lib/links';
import { Persist } from './lib/persist';
import { loadPlugin, matches, registry } from './lib/plugins';
import { type ConnState, Connection } from './lib/rpc';
import { defaultSettings, load, save, type Settings } from './lib/storage';
import { type RunInfo, Store } from './lib/store';
import { connectionLabel, connectParam, hasToken, isLocalOrigin, pastedUrl } from './lib/url';

const store = new Store(load('settings', defaultSettings).maxEvents);
let counter = 0;
const nextN = () => ++counter;
const localOrigin = isLocalOrigin(window.location);
const pageTitle = document.title;

function appName(session: DevEvent | undefined): string | undefined {
  if (!session) return undefined;
  const d = session.data;
  return str(d.name) ?? str(d.app) ?? sessionFields(session).map(([, v]) => str(v)).find(Boolean);
}

// Service extension errors carry the app's message in data.details.
function rpcMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const data = 'data' in err ? err.data : undefined;
  if (data && typeof data === 'object' && 'details' in data) return String(data.details);
  return 'message' in err ? String(err.message) : String(err);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => load('settings', defaultSettings));
  const [connections, setConnections] = useState<ConnEntry[]>(() => load('connections', []));
  const [states, setStates] = useState<Record<string, ConnState>>({});
  const [ready, setReady] = useState(false);
  const [tab, setTabState] = useState(() => load('tab', 'http'));
  const [httpSelected, setHttpSelected] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [pluginErrors, setPluginErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [seenData, setSeenData] = useState(false);
  // Re-renders on every store change; children read from the store directly.
  useSyncExternalStore(store.subscribe, store.getVersion);
  const plugins = useSyncExternalStore(registry.subscribe, registry.getPlugins);
  const persist = useRef<Persist | null>(null);
  const live = useRef(new Map<string, Connection>());
  const loadedPlugins = useRef(new Set<string>());
  const filterRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Read by handlers that are registered once.
  const latest = useRef({ settings, connections, states });
  latest.current = { settings, connections, states };

  const setTab = (t: string) => {
    setTabState(t);
    save('tab', t);
  };

  const setSettings = (next: Settings) => {
    setSettingsState(next);
    save('settings', next);
  };

  const flash = useCallback((text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), 4000);
  }, []);

  const drop = useCallback((pred: (e: DevEvent) => boolean) => {
    const keys = store.remove(pred);
    void persist.current?.delete(keys);
  }, []);

  const onEvents = useCallback(
    (events: DevEvent[]) => {
      if (latest.current.settings.clearOnRestart) {
        // A new run on a connection replaces that connection's earlier runs.
        const runs = store.runs;
        const fresh = new Map<string, DevEvent>();
        for (const e of events) if (!runs.has(e.run) && !fresh.has(e.run)) fresh.set(e.run, e);
        for (const e of fresh.values()) {
          const old = new Set(
            [...runs.values()].filter((r) => r.conn === e.conn && r.last <= e.ts).map((r) => r.run),
          );
          if (old.size) drop((x) => old.has(x.run));
        }
      }
      const added = store.add(events);
      if (added.length) persist.current?.put(added);
    },
    [drop],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (settings.persist) {
        const p = await Persist.open(settings.maxEvents);
        if (p && !cancelled) {
          persist.current = p;
          try {
            const events = await p.load();
            for (const e of events) counter = Math.max(counter, e.n);
            store.add(events);
          } catch {
            // Start empty.
          }
        }
      }
      if (!cancelled) setReady(true);
    })();
    return () => {
      cancelled = true;
    };
    // Runs once; later settings changes are handled below.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    store.maxEvents = settings.maxEvents;
    const p = persist.current;
    if (p) p.maxEvents = settings.maxEvents;
    if (!ready) return;
    if (settings.persist && !p) {
      void Persist.open(settings.maxEvents).then((opened) => {
        persist.current = opened;
        opened?.put([...store.all]);
      });
    } else if (!settings.persist && p) {
      persist.current = null;
      void p.clear();
    }
  }, [settings.persist, settings.maxEvents, ready]);

  useEffect(() => {
    if (!ready) return;
    const map = live.current;
    for (const c of connections) {
      if (map.has(c.id)) continue;
      const conn = new Connection(
        c.id,
        c.url,
        onEvents,
        () => setStates((s) => ({ ...s, [c.id]: conn.state })),
        nextN,
      );
      map.set(c.id, conn);
      conn.start();
    }
    for (const [id, conn] of map) {
      if (!connections.some((c) => c.id === id)) {
        conn.stop();
        map.delete(id);
      }
    }
  }, [connections, ready, onEvents]);

  useEffect(() => {
    const map = live.current;
    return () => {
      for (const conn of map.values()) conn.stop();
      map.clear();
    };
  }, []);

  useEffect(() => {
    for (const url of settings.pluginUrls) {
      if (loadedPlugins.current.has(url)) continue;
      loadedPlugins.current.add(url);
      loadPlugin(url).catch((err: unknown) =>
        setPluginErrors((e) => ({ ...e, [url]: String(err) })),
      );
    }
  }, [settings.pluginUrls]);

  /**
   * A token URL that is not open belongs to a run that ended, so a new URL
   * replaces it. Open ones are other apps still running; the fixed URL stays.
   */
  const addConnection = useCallback(
    (url: string) => {
      const now = latest.current;
      if (now.connections.some((c) => c.url === url)) return;
      const stale = new Set(
        now.connections
          .filter((c) => hasToken(c.url) && now.states[c.id]?.status !== 'open')
          .map((c) => c.id),
      );
      if (stale.size && now.settings.clearOnRestart) drop((e) => stale.has(e.conn));
      const next = [...now.connections.filter((c) => !stale.has(c.id)), { id: crypto.randomUUID(), url }];
      setConnections(next);
      save('connections', next);
    },
    [drop],
  );

  const removeConnection = (id: string) => {
    const next = connections.filter((c) => c.id !== id);
    setConnections(next);
    save('connections', next);
  };

  const importFile = useCallback(
    async (file: File) => {
      try {
        const events = fromSession(await file.text(), nextN);
        onEvents(events);
        flash(`Opened ${events.length} events from ${file.name}.`);
      } catch (err) {
        flash(err instanceof SyntaxError ? 'Not a JSON file.' : String((err as Error).message ?? err));
      }
    },
    [onEvents, flash],
  );

  useEffect(() => {
    if (!ready) return;
    const url = connectParam(location.hash);
    if (url) {
      addConnection(url);
      history.replaceState(null, '', location.pathname + location.search);
    }
  }, [ready, addConnection]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      const url = pastedUrl(e.clipboardData?.getData('text') ?? '');
      if (!url) return;
      e.preventDefault();
      addConnection(url);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      e.preventDefault();
      void importFile(file);
    };
    window.addEventListener('paste', onPaste);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [addConnection, importFile]);

  const clearAll = () => {
    store.clear();
    setHttpSelected(null);
    void persist.current?.clear();
    setUsage(persist.current ? { count: 0, bytes: 0 } : null);
  };

  const callApp = useCallback<AppCall>((e, method, params = {}) => {
    const conn = live.current.get(e.conn);
    if (!conn) return Promise.reject(new Error('The app is not connected.'));
    const withIsolate =
      method.startsWith('ext.') && e.isolateId && params.isolateId === undefined
        ? { ...params, isolateId: e.isolateId }
        : params;
    return conn.call(method, withIsolate);
  }, []);

  const runAction = (e: DevEvent, name: string) => {
    callApp(e, 'ext.devpul.action', { name }).then(
      (result) => {
        const value = result && typeof result === 'object' ? (result as { result?: unknown }).result : undefined;
        flash(`${name}: ${value === undefined || value === null ? 'done' : String(value)}`);
      },
      (err: unknown) => flash(`${name} failed: ${rpcMessage(err)}`),
    );
  };

  const runs = store.runs;
  const runLabel = useCallback(
    (run: string) => {
      const info = runs.get(run);
      if (!info) return run;
      const conn = connections.find((c) => c.id === info.conn);
      const name = appName(info.session) ?? (conn ? connectionLabel(conn.url) : 'app');
      const ver = str(info.session?.data.version);
      return `${name}${ver ? ` ${ver}` : ''} - ${formatTime(info.first)}`;
    },
    [runs, connections],
  );

  const names = useMemo(() => {
    const out: Record<string, string> = {};
    const latestRun: Record<string, number> = {};
    for (const r of runs.values()) {
      const name = appName(r.session);
      if (name && r.last >= (latestRun[r.conn] ?? 0)) {
        out[r.conn] = name;
        latestRun[r.conn] = r.last;
      }
    }
    return out;
  }, [runs]);

  // The latest run of each live connection that offers actions.
  const actions = useMemo<AppActions[]>(() => {
    const best = new Map<string, RunInfo>();
    for (const r of runs.values()) {
      const prev = best.get(r.conn);
      if (!prev || r.last > prev.last) best.set(r.conn, r);
    }
    return [...best.values()].flatMap((r) => {
      const list = r.actions?.data.actions;
      if (!r.actions || !Array.isArray(list) || !list.length || states[r.conn]?.status !== 'open') return [];
      return [{ app: appName(r.session) ?? r.conn, event: r.actions, names: list.map(String) }];
    });
  }, [runs, states]);

  const errors = store.errors;
  const logs = store.logs;
  const allOther = store.other;
  const other = useMemo(
    () => (plugins.length ? allOther.filter((e) => !registry.claims(e.kind)) : allOther),
    [allOther, plugins],
  );
  const pluginEvents = useMemo(
    () => Object.fromEntries(plugins.map((p) => [p.id, allOther.filter((e) => matches(p, e.kind))])),
    [allOther, plugins],
  );
  const latestSession = store.latestSession();
  const tabs: { id: string; label: string; count: number; alert?: boolean }[] = [
    { id: 'http', label: 'HTTP', count: store.httpRows.length },
    { id: 'errors', label: 'Errors', count: errors.length, alert: errors.length > 0 },
    ...(logs.length || tab === 'logs' ? [{ id: 'logs', label: 'Logs', count: logs.length }] : []),
    { id: 'events', label: 'Events', count: other.length },
    ...plugins.map((p) => ({ id: `plugin:${p.id}`, label: p.label, count: pluginEvents[p.id]?.length ?? 0 })),
  ];
  const activePlugin = plugins.find((p) => `plugin:${p.id}` === tab);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'http';
  const tabIds = tabs.map((t) => t.id).join('|');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, dialog')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        filterRef.current?.focus();
      } else if (/^[1-9]$/.test(e.key)) {
        const id = tabIds.split('|')[Number(e.key) - 1];
        if (id) setTab(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabIds]);

  const hasData = store.size > 0;
  useEffect(() => {
    if (hasData) setSeenData(true);
    else if (!connections.length) setSeenData(false);
  }, [hasData, connections.length]);
  const showMain = hasData || (seenData && connections.length > 0);

  useEffect(() => {
    document.body.classList.toggle('has-data', showMain);
    const name = appName(latestSession);
    document.title = showMain
      ? `${errors.length ? `(${errors.length}) ` : ''}${name ? `${name} - ` : ''}DevPul`
      : pageTitle;
  }, [showMain, errors.length, latestSession]);

  const openSettings = () => {
    setUsage(persist.current ? { count: persist.current.count, bytes: persist.current.bytes } : null);
    setSettingsOpen(true);
  };

  const tools = (
    <>
      <button
        type="button"
        className={`btn ${showMain ? '' : 'icon'}`}
        onClick={openSettings}
        aria-label="Settings"
        data-tip={showMain ? undefined : 'Settings'}
      >
        <SettingsIcon size={14} />
        {showMain && <span className="label">Settings</span>}
      </button>
      <ThemeToggle />
    </>
  );

  const connectionBar = (hero: boolean) => (
    <ConnectionBar
      connections={connections}
      states={states}
      names={names}
      localOrigin={localOrigin}
      hero={hero}
      onAdd={addConnection}
      onRemove={removeConnection}
    />
  );

  return (
    <div className="app">
      {!showMain ? (
        <Home
          icon={ICON}
          connect={connectionBar(true)}
          tools={tools}
          waiting={connections.some((c) => states[c.id]?.status === 'open')}
          localOrigin={localOrigin}
          onOpenFile={() => fileRef.current?.click()}
        />
      ) : (
        <>
          <header className="topbar">
            <a className="brand" href="./" aria-label="DevPul home">
              <img src={ICON} alt="" width={20} height={20} />
              DevPul
            </a>
            {connectionBar(false)}
            <nav className="actions">
              {!localOrigin && (
                <a
                  className="btn"
                  href="./index.html"
                  download="devpul.html"
                  data-tip="Single HTML file. Open it from disk to use DevPul without this site (works in Safari)."
                >
                  <Download size={14} />
                  <span className="label">Download</span>
                </a>
              )}
              {tools}
              <a
                className="btn"
                href={pageUrl('help/')}
                target="_blank"
                rel="noopener"
                data-tip="Help opens in a new tab. Press ? for shortcuts."
              >
                <CircleHelp size={14} />
                <span className="label">Help</span>
              </a>
            </nav>
          </header>
          <div className="subbar">
            <div className="tabs" role="tablist">
              {tabs.map((t) => (
                <button
                  type="button"
                  role="tab"
                  key={t.id}
                  aria-selected={activeTab === t.id}
                  className={`tab ${activeTab === t.id ? 'on' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                  {t.count > 0 && <span className={`count ${t.alert ? 'alert' : ''}`}>{t.count}</span>}
                </button>
              ))}
            </div>
            <SessionHeader session={latestSession} fields={settings.headerFields} runs={runs.size} />
            {notice && (
              <span className="notice" role="status">
                {notice}
              </span>
            )}
            <ActionsMenu apps={actions} onRun={runAction} />
            <Menu label="Export" icon={<FileDown size={13} />}>
              <MenuItem
                onClick={() => download(`devpul-${stamp()}.har`, toHar(store.httpRows, version))}
              >
                HTTP as HAR
              </MenuItem>
              <MenuItem
                onClick={() => download(`devpul-${stamp()}.devpul.json`, toSession(store.all))}
              >
                Session file (all events)
              </MenuItem>
              <MenuItem onClick={() => fileRef.current?.click()}>Open a session file</MenuItem>
            </Menu>
            <button type="button" className="btn small" onClick={clearAll}>
              <Trash2 size={13} />
              Clear
            </button>
          </div>
          <main className="content">
            {activeTab === 'http' && (
              <HttpTab
                store={store}
                settings={settings}
                runLabel={runLabel}
                filterRef={filterRef}
                selected={httpSelected}
                onSelect={setHttpSelected}
              />
            )}
            {activeTab === 'errors' && (
              <ErrorsTab
                errors={errors}
                requests={store.httpRows}
                runLabel={runLabel}
                filterRef={filterRef}
                onOpenRequest={(key) => {
                  setHttpSelected(key);
                  setTab('http');
                }}
              />
            )}
            {activeTab === 'logs' && <LogsTab logs={logs} runLabel={runLabel} filterRef={filterRef} />}
            {activeTab === 'events' && <EventsTab events={other} runLabel={runLabel} filterRef={filterRef} />}
            {activePlugin && (
              <PluginTab
                plugin={activePlugin}
                events={pluginEvents[activePlugin.id] ?? []}
                runLabel={runLabel}
                filterRef={filterRef}
                call={callApp}
              />
            )}
          </main>
        </>
      )}

      {!showMain && notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void importFile(file);
          e.target.value = '';
        }}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SettingsDialog
        open={settingsOpen}
        settings={settings}
        sessionKeys={sessionFields(latestSession).map(([k]) => k)}
        usage={usage}
        pluginErrors={pluginErrors}
        onChange={setSettings}
        onClear={clearAll}
        onClose={() => setSettingsOpen(false)}
      />
      <Tooltip />
    </div>
  );
}

export const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0f766e"/><path d="M5 21c4-8 18-8 22 0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M5 21h22M10 17v4M16 15v6M22 17v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
)}`;
