import { cn } from 'cn';
import { CircleHelp, RotateCcw, Settings as SettingsIcon, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { ThemeToggle } from './components/ThemeToggle';
import { Tip } from './components/Tip';
import { Badge } from './components/ui/badge';
import { Button } from './components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './components/ui/tabs';
import { approve } from './core/approvals';
import { type DevEvent, str } from './core/events';
import { fromSession } from './core/export';
import { parseInfo } from './core/info';
import { formatTime } from './core/json';
import { Persist } from './core/persist';
import { type ConnState, Connection, isPaused, rpcMessage } from './core/rpc';
import { appName, sessionFields } from './core/session';
import { latestRuns, type RunInfo, type Selection, Store } from './core/store';
import { connectionLabel, connectParam, hasToken, isLoopback, pastedUrl, toWsUrl } from './core/url';
import { ActionsMenu, appActions, type RunAction } from './features/actions/ActionsMenu';
import { ConnectionBar, type ConnEntry } from './features/connections/ConnectionBar';
import { ErrorsTab } from './features/errors/ErrorsTab';
import { EventsTab } from './features/events/EventsTab';
import { ExportMenu } from './features/export/ExportMenu';
import { Home } from './features/home/Home';
import { HttpTab } from './features/http/HttpTab';
import { LogsTab } from './features/logs/LogsTab';
import { offeredBy, PluginOffers, usePlugins } from './features/plugins/PluginOffers';
import { PluginsView } from './features/plugins/PluginsView';
import { type AppCall, PluginTab } from './features/plugins/PluginTab';
import { matches, registry, writes } from './features/plugins/plugins';
import { SettingsDialog } from './features/settings/SettingsDialog';
import { type Limited, StatusBar } from './features/status/StatusBar';
import { cli, listenCli } from './lib/cli';
import { devtools, hostUri, listenHost } from './lib/devtools';
import { pageUrl } from './lib/links';
import { defaultSettings, load, save, type Settings } from './lib/storage';

const MB = 1024 * 1024;
const store = new Store(load('settings', defaultSettings).maxMB * MB, load<[string, number][]>('cleared', []));
const selectFns = new Map<string, (key: string | null) => void>();
// Stable per tab, so list key handlers are not re-registered on every render.
const selection = (tab: string) => {
  let onSelect = selectFns.get(tab);
  if (!onSelect) selectFns.set(tab, (onSelect = (key) => store.select(tab, key)));
  return { selected: store.selected(tab)?.key ?? null, onSelect };
};
let counter = 0;
const nextN = () => ++counter;
const localOrigin = isLoopback(location.hostname);
const pageTitle = document.title;
const LABEL = 'max-[560px]:hidden';
// DevTools passes the connection; it is not stored, since its token dies with the run.
const hostConnections = (url: string | null): ConnEntry[] => (url ? [{ id: crypto.randomUUID(), url }] : []);
// Registered by `flutter run`, which reloads every device it runs.
const HOT = {
  reloadSources: { label: 'Reload', done: 'Reloaded', tip: 'Hot reload (r)' },
  hotRestart: { label: 'Restart', done: 'Restarted', tip: 'Hot restart (R)' },
} as const;
type Hot = keyof typeof HOT;
const hotTargets = (service: Hot, connections: ConnEntry[], states: Record<string, ConnState>) =>
  connections.filter((c) => states[c.id]?.status === 'open' && states[c.id]?.services[service]);

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => load('settings', defaultSettings));
  const [connections, setConnections] = useState<ConnEntry[]>(() =>
    devtools ? hostConnections(hostUri()) : load('connections', []),
  );
  const [states, setStates] = useState<Record<string, ConnState>>({});
  const [ready, setReady] = useState(false);
  const [tab, setTabState] = useState(() => load('tab', 'http'));
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [seenData, setSeenData] = useState(false);
  // The Plugins view opened from Home, with no events to show.
  const [browsing, setBrowsing] = useState(false);
  const [cliPlugins, setCliPlugins] = useState<string[]>([]);
  // Re-renders on every store change; children read from the store directly.
  useSyncExternalStore(store.subscribe, store.getVersion);
  const plugins = useSyncExternalStore(registry.subscribe, registry.getPlugins);
  const writesOn = useSyncExternalStore(writes.subscribe, writes.get);
  const persist = useRef<Persist | null>(null);
  const live = useRef(new Map<string, Connection>());
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

  const flash = useCallback((text: string, ms = 4000) => {
    setNotice(text);
    setTimeout(() => setNotice((n) => (n === text ? null : n)), ms);
  }, []);

  const drop = useCallback((pred: (e: DevEvent) => boolean) => {
    void persist.current?.delete(store.remove(pred));
  }, []);

  const onEvents = useCallback(
    (events: DevEvent[]) => {
      if (latest.current.settings.clearOnRestart) {
        // A new run on a connection replaces that connection's earlier runs.
        const runs = store.runs;
        const fresh = new Map<string, DevEvent>();
        for (const e of events) if (!runs.has(e.run) && !fresh.has(e.run)) fresh.set(e.run, e);
        for (const e of fresh.values()) {
          const old = new Set([...runs.values()].filter((r) => r.conn === e.conn && r.last <= e.ts).map((r) => r.run));
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
        const p = await Persist.open(settings.maxMB * MB);
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
    const maxBytes = settings.maxMB * MB;
    store.setMaxBytes(maxBytes);
    const p = persist.current;
    if (p) p.maxBytes = maxBytes;
    if (!ready) return;
    if (settings.persist && !p) {
      void Persist.open(maxBytes).then((opened) => {
        persist.current = opened;
        opened?.put([...store.all]);
      });
    } else if (!settings.persist && p) {
      persist.current = null;
      void p.clear();
    }
  }, [settings.persist, settings.maxMB, ready]);

  useEffect(() => {
    if (!ready) return;
    const map = live.current;
    for (const c of connections) {
      if (map.has(c.id)) continue;
      const conn = new Connection(
        c.id,
        c.url,
        (events) => onEvents(store.sinceClear(events)),
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

  const storeConnections = (next: ConnEntry[]) => {
    setConnections(next);
    // A stopped connection reports no state change.
    setStates((s) => Object.fromEntries(Object.entries(s).filter(([id]) => next.some((c) => c.id === id))));
    if (!devtools) save('connections', next);
  };

  /**
   * A token URL that is not open belongs to a run that ended, so a new URL
   * replaces it. Open ones are other apps still running; the fixed URL stays.
   * Under DevTools the new URL replaces every other.
   */
  const addConnection = useCallback(
    (url: string | null) => {
      const now = latest.current;
      if (url && now.connections.some((c) => c.url === url)) return;
      const stale = new Set(
        now.connections.filter((c) => hasToken(c.url) && now.states[c.id]?.status !== 'open').map((c) => c.id),
      );
      if (stale.size && now.settings.clearOnRestart) drop((e) => stale.has(e.conn));
      const kept = devtools ? [] : now.connections.filter((c) => !stale.has(c.id));
      storeConnections([...kept, ...hostConnections(url)]);
    },
    [drop],
  );

  const removeConnection = (id: string) => storeConnections(connections.filter((c) => c.id !== id));

  useEffect(() => {
    if (!cli) return;
    return listenCli({
      connect: (vmUrl) => {
        const url = toWsUrl(vmUrl);
        if (url) addConnection(url);
      },
      plugins: setCliPlugins,
    });
  }, [addConnection]);

  useEffect(() => {
    if (!devtools) return;
    return listenHost({
      connect: addConnection,
      theme: (theme) => (document.documentElement.dataset.theme = theme),
    });
  }, [addConnection]);

  const importFile = useCallback(
    async (file: File) => {
      try {
        const events = fromSession(await file.text(), `file:${file.name}`, nextN);
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
    const param = connectParam(location.hash);
    if (!param) return;
    if (param.allowed) addConnection(param.url);
    else {
      flash(
        `Not connecting to ${connectionLabel(param.url)} from the link: links connect only to this machine. Paste the URL to connect anyway.`,
        15000,
      );
    }
    history.replaceState(null, '', location.pathname + location.search);
  }, [ready, addConnection, flash]);

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
    save('cleared', store.clearedSeqs);
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

  const runAction: RunAction = (e, name, args) => {
    callApp(e, 'ext.devpul.action', { name, ...(args && { args: JSON.stringify(args) }) }).then(
      (result) => {
        const value = result && typeof result === 'object' ? (result as { result?: unknown }).result : undefined;
        flash(`${name}: ${value === undefined || value === null ? 'done' : String(value)}`);
      },
      (err: unknown) => flash(`${name} failed: ${rpcMessage(err)}`),
    );
  };

  const runHot = useCallback(
    (service: Hot) => {
      const { connections: all, states: now } = latest.current;
      const targets = hotTargets(service, all, now);
      if (!targets.length) return;
      Promise.all(targets.map((c) => live.current.get(c.id)?.callService(service))).then(
        () => flash(HOT[service].done),
        (err: unknown) => flash(`${HOT[service].label} failed: ${rpcMessage(err)}`),
      );
    },
    [flash],
  );

  const runs = store.runs;
  // Runs change with every event; the labels rarely do. A stable runLabel lets list rows skip re-rendering.
  const labels = useMemo(
    () =>
      JSON.stringify(
        [...runs.values()].map((info) => {
          const conn = connections.find((c) => c.id === info.conn);
          const name = appName(info.session) ?? (conn ? connectionLabel(conn.url) : 'app');
          const ver = str(info.session?.data.version);
          return [info.run, `${name}${ver ? ` ${ver}` : ''} - ${formatTime(info.first)}`];
        }),
      ),
    [runs, connections],
  );
  const runLabel = useMemo(() => {
    const byRun = new Map<string, string>(JSON.parse(labels) as [string, string][]);
    return (run: string) => byRun.get(run) ?? run;
  }, [labels]);

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

  const runName = useCallback(
    (r: RunInfo) => appName(r.session) ?? connectionLabel(connections.find((c) => c.id === r.conn)?.url ?? r.conn),
    [connections],
  );

  const pluginUrls = useMemo(() => [...settings.pluginUrls, ...cliPlugins], [settings.pluginUrls, cliPlugins]);
  const pluginOffers = usePlugins({
    runs,
    states,
    approvals: settings.plugins,
    urls: pluginUrls,
    call: callApp,
    appName: runName,
    onApprove: (a) => setSettings({ ...settings, plugins: approve(settings.plugins, a) }),
  });

  // The icon is in the plugin source, so the Plugins view only learns it once the plugin loads.
  useEffect(() => {
    const now = latest.current.settings;
    let changed = false;
    const next = now.plugins.map((a) => {
      const icon = plugins.find((p) => p.origin === a.id && typeof p.plugin.icon === 'string')?.plugin.icon;
      if (icon === undefined || icon === a.icon) return a;
      changed = true;
      return { ...a, icon };
    });
    if (changed) setSettings({ ...now, plugins: next });
  }, [plugins]);

  const actions = useMemo(() => appActions(runs, states), [runs, states]);
  const limitApps = latestRuns(runs).flatMap((run) =>
    run.info && states[run.conn]?.status === 'open'
      ? [{ name: runName(run), run, paused: isPaused(states[run.conn], run.info.isolateId) }]
      : [],
  );

  const openRuns = latestRuns(runs).filter((r) => r.info && states[r.conn]?.status === 'open');
  const limited = openRuns.flatMap((run): Limited[] =>
    Object.entries(run.info ? parseInfo(run.info.data).limits : {}).map(([kind, perSecond]) => ({
      app: openRuns.length > 1 ? runName(run) : undefined,
      kind,
      perSecond,
    })),
  );

  const errors = store.errors;
  const logs = store.logs;
  const allOther = store.other;
  const other = useMemo(
    () => (plugins.length ? allOther.filter((e) => !registry.claims(e.kind)) : allOther),
    [allOther, plugins],
  );
  const pluginEvents = useMemo(
    () => Object.fromEntries(plugins.map(({ plugin: p }) => [p.id, allOther.filter((e) => matches(p, e.kind))])),
    [allOther, plugins],
  );
  const latestSession = store.latestSession();
  type TabInfo = { id: string; label: string; icon?: string; count: number; alert?: boolean };
  // Pinned to the right edge, outside the scrolling tabs.
  const pluginsTab: TabInfo = {
    id: 'plugins',
    label: 'Plugins',
    count: pluginOffers.offers.filter((o) => !o.dismissed).length,
  };
  const tabs: TabInfo[] = [
    { id: 'http', label: 'HTTP', count: store.httpRows.length },
    { id: 'errors', label: 'Errors', count: errors.length, alert: errors.length > 0 },
    ...(logs.length || tab === 'logs' ? [{ id: 'logs', label: 'Logs', count: logs.length }] : []),
    { id: 'events', label: 'Events', count: other.length },
    ...plugins.map(({ plugin: p }) => ({
      id: `plugin:${p.id}`,
      label: p.label,
      icon: p.icon,
      count: pluginEvents[p.id]?.length ?? 0,
    })),
    pluginsTab,
  ];
  const activeLoaded = plugins.find(({ plugin: p }) => `plugin:${p.id}` === tab);
  const activePlugin = activeLoaded?.plugin;
  // Calls from a whole-tab plugin before any of its events go to the app that offered it.
  const pluginFallback = activeLoaded ? offeredBy(runs, activeLoaded.origin) : undefined;
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'http';
  const tabIds = tabs.map((t) => t.id).join('|');
  const tabTrigger = (t: TabInfo, className?: string) => (
    <TabsTrigger
      key={t.id}
      value={t.id}
      // Radix keeps the tab stop on the last focused tab, which digit keys do not move.
      tabIndex={t.id === activeTab ? 0 : -1}
      // The default focus ring and border crowd the dense strip.
      className={cn(
        "flex-none px-2.5 text-[13px] font-normal text-muted-foreground group-data-[orientation=horizontal]/tabs:after:bottom-0 after:bg-primary focus-visible:border-transparent focus-visible:ring-0 [&_svg:not([class*='size-'])]:size-3.5",
        className,
      )}
    >
      {t.icon && <span className="inline-flex" aria-hidden dangerouslySetInnerHTML={{ __html: t.icon }} />}
      {t.id.startsWith('plugin:') ? (
        <Tip content={t.label} whenCut>
          <span className="max-w-40 truncate">{t.label}</span>
        </Tip>
      ) : (
        t.label
      )}
      {t.count > 0 && (
        <Badge
          variant={t.alert ? 'destructive' : 'secondary'}
          className={cn('font-normal', !t.alert && 'text-muted-foreground')}
        >
          {t.count}
        </Badge>
      )}
    </TabsTrigger>
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, textarea, select, [role=dialog], [role=menu]')) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        filterRef.current?.focus();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        runHot(e.key === 'r' ? 'reloadSources' : 'hotRestart');
      } else if (/^[1-9]$/.test(e.key)) {
        const id = tabIds.split('|')[Number(e.key) - 1];
        if (id) setTab(id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tabIds, runHot]);

  const hasData = store.size > 0;
  useEffect(() => {
    if (hasData) setSeenData(true);
    else if (!connections.length) setSeenData(false);
  }, [hasData, connections.length]);
  const showMain = hasData || (seenData && connections.length > 0) || browsing;

  useEffect(() => {
    document.body.classList.toggle('has-data', showMain);
    const name = appName(latestSession);
    document.title = showMain
      ? `${errors.length ? `(${errors.length}) ` : ''}${name ? `${name} - ` : ''}DevPul`
      : pageTitle;
  }, [showMain, errors.length, latestSession]);

  const openIn = (to: string, key: string, from?: Selection['from']) => {
    store.select(to, key, from);
    setTab(to);
  };
  const httpFrom = store.selected('http')?.from;

  const openSettings = () => {
    setUsage(persist.current ? { count: persist.current.count, bytes: persist.current.bytes } : null);
    setSettingsOpen(true);
  };

  const settingsButton = (
    <Button
      type="button"
      // Ghost in the header, so the session controls under it carry the weight.
      variant={showMain ? 'ghost' : 'outline'}
      size={showMain ? 'sm' : 'icon-sm'}
      onClick={openSettings}
      aria-label="Settings"
    >
      <SettingsIcon />
      {showMain && <span className={LABEL}>Settings</span>}
    </Button>
  );
  const tools = (
    <>
      <Tip content="Settings">{settingsButton}</Tip>
      {!devtools && <ThemeToggle variant="outline" />}
    </>
  );

  const controls = (
    <>
      {(Object.keys(HOT) as Hot[]).map(
        (service) =>
          hotTargets(service, connections, states).length > 0 && (
            <Tip key={service} content={HOT[service].tip}>
              <Button
                type="button"
                variant="outline"
                size="xs"
                aria-label={HOT[service].label}
                onClick={() => runHot(service)}
              >
                {service === 'reloadSources' ? <Zap /> : <RotateCcw />}
                <span className={LABEL}>{HOT[service].label}</span>
              </Button>
            </Tip>
          ),
      )}
      <ActionsMenu apps={actions} onRun={runAction} />
      <ExportMenu store={store} onOpenFile={() => fileRef.current?.click()} />
      <Button type="button" variant="outline" size="xs" aria-label="Clear" onClick={clearAll}>
        <Trash2 />
        <span className={LABEL}>Clear</span>
      </Button>
    </>
  );

  const connectionBar = (hero: boolean) => (
    <ConnectionBar
      connections={connections}
      states={states}
      names={names}
      localOrigin={localOrigin}
      managed={devtools}
      hero={hero}
      controls={hero ? undefined : controls}
      onAdd={addConnection}
      onRemove={removeConnection}
    />
  );

  return (
    <div className={cn('flex flex-col', showMain && 'h-screen')}>
      {!showMain ? (
        <Home
          icon={ICON}
          connect={connectionBar(true)}
          tools={tools}
          waiting={devtools || connections.some((c) => states[c.id]?.status === 'open')}
          onOpenFile={() => fileRef.current?.click()}
          onOpenPlugins={() => {
            setTab('plugins');
            setBrowsing(true);
          }}
        />
      ) : (
        <>
          <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5 border-b bg-card px-3 py-2 max-[860px]:grid-cols-[minmax(0,1fr)_auto]">
            <a
              className="col-start-1 row-start-1 flex items-center gap-1.5 pt-1 text-[15px] font-bold whitespace-nowrap"
              // DevTools passes the connection in the query.
              href={devtools ? `./${location.search}` : './'}
              aria-label="DevPul home"
            >
              <img src={ICON} alt="" width={20} height={20} />
              DevPul
            </a>
            {connectionBar(false)}
            <nav className="col-start-3 row-start-1 flex gap-1.5 max-[860px]:col-start-2">
              {settingsButton}
              <Tip content="Help opens in a new tab. Press ? for shortcuts.">
                <Button asChild variant="ghost" size="sm">
                  <a href={pageUrl('help/')} target="_blank" rel="noopener">
                    <CircleHelp />
                    <span className={LABEL}>Help</span>
                  </a>
                </Button>
              </Tip>
              {!devtools && <ThemeToggle variant="ghost" label />}
            </nav>
          </header>
          <Tabs value={activeTab} onValueChange={setTab} className="min-h-0 flex-1 gap-0">
            <div className="flex min-h-9 items-center border-b bg-card px-3">
              <TabsList variant="line" className="w-full justify-start p-0">
                <div className="flex h-full min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                  {tabs.filter((t) => t !== pluginsTab).map((t) => tabTrigger(t))}
                </div>
                {tabTrigger(pluginsTab, 'ml-auto')}
              </TabsList>
            </div>
            {activeTab !== 'plugins' && (
              <PluginOffers
                offers={pluginOffers.offers}
                onAllow={pluginOffers.allow}
                onDismiss={pluginOffers.dismiss}
              />
            )}
            <main className="flex min-h-0 flex-1">
              <TabsContent value={activeTab} className="flex min-h-0 min-w-0">
                {activeTab === 'http' && (
                  <HttpTab
                    store={store}
                    settings={settings}
                    runLabel={runLabel}
                    filterRef={filterRef}
                    {...selection('http')}
                    onBack={httpFrom && (() => openIn(httpFrom.tab, httpFrom.key))}
                  />
                )}
                {activeTab === 'errors' && (
                  <ErrorsTab
                    errors={errors}
                    requests={store.httpRows}
                    runLabel={runLabel}
                    filterRef={filterRef}
                    {...selection('errors')}
                    onOpenRequest={(key) => {
                      const error = store.selected('errors');
                      openIn('http', key, error && { tab: 'errors', key: error.key });
                    }}
                  />
                )}
                {activeTab === 'logs' && (
                  <LogsTab logs={logs} runLabel={runLabel} filterRef={filterRef} {...selection('logs')} />
                )}
                {activeTab === 'events' && (
                  <EventsTab events={other} runLabel={runLabel} filterRef={filterRef} {...selection('events')} />
                )}
                {activeTab === 'plugins' && (
                  <PluginsView
                    offers={pluginOffers.offers}
                    approvals={settings.plugins}
                    urls={settings.pluginUrls}
                    served={cliPlugins}
                    errors={pluginOffers.errors}
                    writes={writesOn}
                    onWrites={(on) => writes.set(on)}
                    onAllow={pluginOffers.allow}
                    onDismiss={pluginOffers.dismiss}
                    onApprovals={(approvals) => setSettings({ ...latest.current.settings, plugins: approvals })}
                    onUrls={(urls) => setSettings({ ...latest.current.settings, pluginUrls: urls })}
                  />
                )}
                {activePlugin && (
                  <PluginTab
                    {...selection(activeTab)}
                    plugin={activePlugin}
                    events={pluginEvents[activePlugin.id] ?? []}
                    fallback={pluginFallback}
                    runLabel={runLabel}
                    filterRef={filterRef}
                    call={callApp}
                  />
                )}
              </TabsContent>
            </main>
          </Tabs>
          <StatusBar
            session={latestSession}
            fields={settings.statusFields}
            states={connections.map((c) => states[c.id])}
            runs={runs.size}
            notice={notice}
            memory={{ count: store.size, bytes: store.bytes, dropped: store.dropped, maxBytes: settings.maxMB * MB }}
            limited={limited}
            pluginErrors={pluginOffers.errors}
            writes={writesOn}
            onWritesOff={() => writes.set(false)}
            onOpenSettings={openSettings}
            onOpenPlugins={() => setTab('plugins')}
          />
        </>
      )}

      {!showMain && notice && (
        <div
          className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-md bg-foreground px-3 py-1.5 text-xs text-background"
          role="status"
        >
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
        memory={{ count: store.size, bytes: store.bytes, dropped: store.dropped }}
        usage={usage}
        limitApps={limitApps}
        call={callApp}
        onChange={setSettings}
        onClear={clearAll}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

export const ICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0f766e"/><path d="M5 21c4-8 18-8 22 0" stroke="#fff" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M5 21h22M10 17v4M16 15v6M22 17v4" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>',
)}`;
