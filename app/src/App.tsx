import { CircleHelp, Download, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ConnectionBar, type ConnEntry } from './components/ConnectionBar';
import { ErrorsTab } from './components/ErrorsTab';
import { EventsTab } from './components/EventsTab';
import { HelpDialog } from './components/HelpDialog';
import { HttpTab } from './components/HttpTab';
import { PluginTab } from './components/PluginTab';
import { SessionHeader, sessionFields } from './components/SessionHeader';
import { SettingsDialog } from './components/SettingsDialog';
import { Tooltip } from './components/Tooltip';
import { type DevEvent, str } from './lib/events';
import { formatTime } from './lib/json';
import { Persist } from './lib/persist';
import { loadPlugin, registry } from './lib/plugins';
import { type ConnState, Connection } from './lib/rpc';
import { defaultSettings, load, save, type Settings } from './lib/storage';
import { Store } from './lib/store';
import { connectionLabel, isLocalOrigin } from './lib/url';

const store = new Store(load('settings', defaultSettings).maxEvents);
let counter = 0;
const nextN = () => ++counter;
const localOrigin = isLocalOrigin(window.location);

function appName(session: DevEvent | undefined): string | undefined {
  if (!session) return undefined;
  const d = session.data;
  return str(d.name) ?? str(d.app) ?? sessionFields(session).map(([, v]) => str(v)).find(Boolean);
}

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => load('settings', defaultSettings));
  const [connections, setConnections] = useState<ConnEntry[]>(() => load('connections', []));
  const [states, setStates] = useState<Record<string, ConnState>>({});
  const [ready, setReady] = useState(false);
  const [tab, setTabState] = useState(() => load('tab', 'http'));
  const [helpOpen, setHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [pluginErrors, setPluginErrors] = useState<Record<string, string>>({});
  // Re-renders on every store change; children read from the store directly.
  useSyncExternalStore(store.subscribe, store.getVersion);
  const plugins = useSyncExternalStore(registry.subscribe, registry.getPlugins);
  const persist = useRef<Persist | null>(null);
  const live = useRef(new Map<string, Connection>());
  const loadedPlugins = useRef(new Set<string>());
  const filterRef = useRef<HTMLInputElement>(null);

  const setTab = (t: string) => {
    setTabState(t);
    save('tab', t);
  };

  const setSettings = (next: Settings) => {
    setSettingsState(next);
    save('settings', next);
  };

  const onEvents = useCallback((events: DevEvent[]) => {
    const added = store.add(events);
    if (added.length) persist.current?.put(added);
  }, []);

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, dialog')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        setTab('http');
        requestAnimationFrame(() => filterRef.current?.focus());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const empty = connections.length === 0 && store.size === 0;
  useEffect(() => {
    const intro = document.getElementById('intro');
    if (intro) intro.hidden = !empty;
    document.body.classList.toggle('has-data', !empty);
  }, [empty]);

  const addConnection = (url: string) => {
    if (connections.some((c) => c.url === url)) return;
    const next = [...connections, { id: crypto.randomUUID(), url }];
    setConnections(next);
    save('connections', next);
  };

  const removeConnection = (id: string) => {
    const next = connections.filter((c) => c.id !== id);
    setConnections(next);
    save('connections', next);
  };

  const clearAll = () => {
    store.clear();
    void persist.current?.clear();
    setUsage(persist.current ? { count: 0, bytes: 0 } : null);
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
    const latest: Record<string, number> = {};
    for (const r of runs.values()) {
      const name = appName(r.session);
      if (name && r.last >= (latest[r.conn] ?? 0)) {
        out[r.conn] = name;
        latest[r.conn] = r.last;
      }
    }
    return out;
  }, [runs]);

  const errors = store.errors;
  const allOther = store.other;
  const other = useMemo(
    () => (plugins.length ? allOther.filter((e) => !registry.claims(e.kind)) : allOther),
    [allOther, plugins],
  );
  const latestSession = store.latestSession();
  const tabs: { id: string; label: string; count: number; alert?: boolean }[] = [
    { id: 'http', label: 'HTTP', count: store.httpRows.length },
    { id: 'errors', label: 'Errors', count: errors.length, alert: errors.length > 0 },
    { id: 'events', label: 'Events', count: other.length },
    ...plugins.map((p) => ({ id: `plugin:${p.id}`, label: p.label, count: 0 })),
  ];
  const activePlugin = plugins.find((p) => `plugin:${p.id}` === tab);
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'http';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="./" aria-label="DevPul home">
          <img src={ICON} alt="" width={20} height={20} />
          DevPul
        </a>
        <ConnectionBar
          connections={connections}
          states={states}
          names={names}
          localOrigin={localOrigin}
          onAdd={addConnection}
          onRemove={removeConnection}
        />
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
          <button
            type="button"
            className="btn"
            onClick={() => {
              setUsage(persist.current ? { count: persist.current.count, bytes: persist.current.bytes } : null);
              setSettingsOpen(true);
            }}
          >
            <SettingsIcon size={14} />
            <span className="label">Settings</span>
          </button>
          <button type="button" className="btn" onClick={() => setHelpOpen(true)}>
            <CircleHelp size={14} />
            <span className="label">Help</span>
          </button>
        </nav>
      </header>

      {!empty && (
        <>
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
            <button type="button" className="btn small" onClick={clearAll}>
              <Trash2 size={13} />
              Clear
            </button>
          </div>
          <main className="content">
            {activeTab === 'http' && (
              <HttpTab store={store} settings={settings} runLabel={runLabel} filterRef={filterRef} />
            )}
            {activeTab === 'errors' && <ErrorsTab errors={errors} runLabel={runLabel} />}
            {activeTab === 'events' && <EventsTab events={other} runLabel={runLabel} />}
            {activePlugin && <PluginTab plugin={activePlugin} events={store.other} />}
          </main>
        </>
      )}

      <HelpDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
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
