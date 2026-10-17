import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList, type ListSelection } from '../../components/EventList';
import { JsonModeToggle, JsonView } from '../../components/JsonView';
import type { DevEvent } from '../../core/events';
import { formatTime, pretty } from '../../core/json';
import type { HttpRow } from '../../core/store';
import { StartedRequests } from '../http/DetailPanel';
import { pluginUi } from './pluginUi';
import {
  type DevpulPlugin,
  type PluginContext,
  type PluginEvent,
  type PluginRequest,
  pluginCalls,
  toPluginEvent,
  toPluginRequest,
  writes,
} from './plugins';

export type AppCall = (e: DevEvent, method: string, params?: Record<string, unknown>) => Promise<unknown>;

interface Props extends ListSelection {
  plugin: DevpulPlugin;
  /** The plugin's events, newest first. */
  events: DevEvent[];
  /** Where `renderTab` calls go when the plugin has no events yet. */
  fallback?: DevEvent;
  runLabel: (run: string) => string;
  /** Events from more than one app run are listed. */
  multiRun: boolean;
  filterRef: RefObject<HTMLInputElement | null>;
  call: AppCall;
  /** Calls the plugin's events started, oldest first. */
  requests: HttpRow[];
  /** The calls an event started. */
  started: (e: DevEvent) => HttpRow[];
  /** Opens [row] in the HTTP tab, Back returning to the event with [key]. */
  onOpenRequest: (key: string, row: HttpRow) => void;
}

type Listener = (events: PluginEvent[]) => void;
type RequestListener = (requests: PluginRequest[]) => void;

function emit<T>(listeners: Set<(items: T[]) => void>, items: T[]): void {
  for (const fn of listeners) {
    try {
      fn(items);
    } catch (err) {
      console.error(err);
    }
  }
}

/** Feeds `context.events` and `context.onEvents` without re-rendering plugins. */
function useFeed(events: DevEvent[]) {
  const feed = useRef({ events, listeners: new Set<Listener>(), lastN: Math.max(0, ...events.map((e) => e.n)) });
  useEffect(() => {
    const f = feed.current;
    f.events = events;
    const fresh = events.filter((e) => e.n > f.lastN).toReversed();
    if (!fresh.length) return;
    f.lastN = Math.max(f.lastN, ...fresh.map((e) => e.n));
    emit(f.listeners, fresh.map(toPluginEvent));
  }, [events]);
  return feed;
}

/** Feeds `context.requests` and `context.onRequests`; a row is a new object whenever its call changes. */
function useRequestFeed(rows: HttpRow[], open: (row: HttpRow) => void) {
  const feed = useRef({
    rows,
    open,
    listeners: new Set<RequestListener>(),
    seen: new Map(rows.map((r) => [r.key, r])),
  });
  useEffect(() => {
    feed.current.open = open;
  });
  useEffect(() => {
    const f = feed.current;
    f.rows = rows;
    const fresh = rows.filter((r) => f.seen.get(r.key) !== r);
    f.seen = new Map(rows.map((r) => [r.key, r]));
    if (fresh.length) emit(f.listeners, fresh.map(toPluginRequest));
  }, [rows]);
  return feed;
}

function makeContext(
  feed: ReturnType<typeof useFeed>,
  requests: ReturnType<typeof useRequestFeed>,
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
  stops: Set<() => void>,
): PluginContext {
  const track = (off: () => void) => {
    const stop = () => {
      stops.delete(stop);
      off();
    };
    stops.add(stop);
    return stop;
  };
  return {
    get events() {
      return feed.current.events.toReversed().map(toPluginEvent);
    },
    onEvents: (fn) => {
      const listeners = feed.current.listeners;
      listeners.add(fn);
      return track(() => listeners.delete(fn));
    },
    get requests() {
      return requests.current.rows.map(toPluginRequest);
    },
    onRequests: (fn) => {
      const listeners = requests.current.listeners;
      listeners.add(fn);
      return track(() => listeners.delete(fn));
    },
    openRequest: (key) => {
      const row = requests.current.rows.find((r) => r.key === key);
      if (row) requests.current.open(row);
    },
    ...pluginCalls(call),
    get writes() {
      return writes.on;
    },
    onWritesChange: (fn) => track(writes.subscribe(fn)),
    ui: pluginUi,
  };
}

/** Runs a plugin's render function and undoes it when deps change. */
function usePluginRender(
  ref: RefObject<HTMLDivElement | null>,
  run: (el: HTMLElement, stops: Set<() => void>) => void | (() => void),
  deps: unknown[],
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stops = new Set<() => void>();
    let cleanup: void | (() => void);
    try {
      cleanup = run(el, stops);
    } catch (err) {
      el.textContent = `Plugin error: ${String(err)}`;
    }
    return () => {
      try {
        cleanup?.();
      } catch {
        // Plugin cleanup errors are not ours to surface.
      }
      for (const stop of stops) stop();
      el.replaceChildren();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function PluginTab(props: Props) {
  if (props.plugin.renderTab) return <WholeTab {...props} />;
  return <PluginList {...props} />;
}

function PluginList(props: Props) {
  const { plugin, events, runLabel, multiRun, filterRef, call, selected, onSelect, onBack } = props;
  const { requests, started, onOpenRequest } = props;
  const cells = useCallback(
    (e: DevEvent) => (
      <>
        <span role="gridcell" className="text-muted-foreground">
          {formatTime(e.ts)}
        </span>
        <span role="gridcell" className="truncate font-semibold">
          {e.kind}
        </span>
        {multiRun && (
          <span role="gridcell" className="truncate text-muted-foreground">
            {runLabel(e.run)}
          </span>
        )}
        <span role="gridcell" className="truncate">
          {summary(plugin, e)}
        </span>
      </>
    ),
    [plugin, runLabel, multiRun],
  );
  return (
    <EventList
      key={plugin.id}
      id={`plugin:${plugin.id}`}
      label={plugin.label}
      selected={selected}
      onSelect={onSelect}
      onBack={onBack}
      events={events}
      filterRef={filterRef}
      placeholder="Filter, e.g. words -word kind: tag:k=v"
      columns={`96px minmax(120px, 200px)${multiRun ? ' minmax(0, 160px)' : ''} minmax(0, 1fr)`}
      empty={`No events for ${plugin.label} yet.`}
      cells={cells}
      head={(e) => (
        <>
          <span className="font-mono font-semibold">{e.kind}</span>
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          {!plugin.render && <JsonModeToggle />}
          <CopyButton text={() => pretty(e.data)} />
        </>
      )}
      body={(e) => (
        <>
          <StartedRequests rows={started(e)} onOpen={(row) => onOpenRequest(e.key, row)} />
          {plugin.render ? (
            <PluginView
              key={e.key}
              plugin={plugin}
              event={e}
              events={events}
              call={call}
              requests={requests}
              onOpenRequest={onOpenRequest}
            />
          ) : (
            <div className="px-3 py-2">
              <JsonView value={e.data} />
            </div>
          )}
        </>
      )}
    />
  );
}

function summary(plugin: DevpulPlugin, e: DevEvent): string {
  try {
    return plugin.summarize?.(toPluginEvent(e)) ?? '';
  } catch {
    return '';
  }
}

function PluginView(
  props: Pick<Props, 'plugin' | 'events' | 'call' | 'requests' | 'onOpenRequest'> & { event: DevEvent },
) {
  const { plugin, event, events, call, requests, onOpenRequest } = props;
  const ref = useRef<HTMLDivElement>(null);
  const feed = useFeed(events);
  const requestFeed = useRequestFeed(requests, (row) => onOpenRequest(event.key, row));
  usePluginRender(
    ref,
    (el, stops) =>
      plugin.render?.(
        el,
        toPluginEvent(event),
        makeContext(feed, requestFeed, (method, params) => call(event, method, params), stops),
      ),
    [plugin, event, call],
  );
  return <div ref={ref} className="plugin-view px-3 py-2" />;
}

function WholeTab({ plugin, events, fallback, call, requests, onOpenRequest }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const feed = useFeed(events);
  const requestFeed = useRequestFeed(requests, (row) => onOpenRequest(eventKey(row), row));
  const target = useRef(events[0] ?? fallback);
  useEffect(() => {
    target.current = events[0] ?? fallback;
  }, [events, fallback]);
  usePluginRender(
    ref,
    (el, stops) =>
      plugin.renderTab?.(
        el,
        makeContext(
          feed,
          requestFeed,
          (method, params) => {
            const e = target.current;
            return e ? call(e, method, params) : Promise.reject(new Error('No app has sent events for this tab.'));
          },
          stops,
        ),
      ),
    [plugin, call],
  );
  return <div ref={ref} className="plugin-view min-w-0 flex-1 overflow-auto px-3 py-2" />;
}

const eventKey = (row: HttpRow) => toPluginRequest(row).event;
