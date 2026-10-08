import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList, type ListSelection } from '../../components/EventList';
import { JsonView } from '../../components/JsonView';
import type { DevEvent } from '../../core/events';
import { formatTime, pretty } from '../../core/json';
import { pluginUi } from './pluginUi';
import { type DevpulPlugin, type PluginContext, type PluginEvent, toPluginEvent } from './plugins';

export type AppCall = (e: DevEvent, method: string, params?: Record<string, unknown>) => Promise<unknown>;

interface Props extends ListSelection {
  plugin: DevpulPlugin;
  /** The plugin's events, newest first. */
  events: DevEvent[];
  /** Where `renderTab` calls go when the plugin has no events yet. */
  fallback?: DevEvent;
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
  call: AppCall;
}

type Listener = (events: PluginEvent[]) => void;

/** Feeds `context.events` and `context.onEvents` without re-rendering plugins. */
function useFeed(events: DevEvent[]) {
  const feed = useRef({ events, listeners: new Set<Listener>(), lastN: Math.max(0, ...events.map((e) => e.n)) });
  useEffect(() => {
    const f = feed.current;
    f.events = events;
    const fresh = events.filter((e) => e.n > f.lastN).toReversed();
    if (!fresh.length) return;
    f.lastN = Math.max(f.lastN, ...fresh.map((e) => e.n));
    const out = fresh.map(toPluginEvent);
    for (const fn of f.listeners) {
      try {
        fn(out);
      } catch (err) {
        console.error(err);
      }
    }
  }, [events]);
  return feed;
}

function makeContext(
  feed: ReturnType<typeof useFeed>,
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>,
  listeners: Set<Listener>,
): PluginContext {
  return {
    get events() {
      return feed.current.events.toReversed().map(toPluginEvent);
    },
    onEvents: (fn) => {
      listeners.add(fn);
      feed.current.listeners.add(fn);
      return () => {
        listeners.delete(fn);
        feed.current.listeners.delete(fn);
      };
    },
    call,
    ui: pluginUi,
  };
}

/** Runs a plugin's render function and undoes it when deps change. */
function usePluginRender(
  ref: RefObject<HTMLDivElement | null>,
  run: (el: HTMLElement, listeners: Set<Listener>) => void | (() => void),
  feed: ReturnType<typeof useFeed>,
  deps: unknown[],
) {
  useEffect(() => {
    const el = ref.current;
    const f = feed.current;
    if (!el) return;
    const listeners = new Set<Listener>();
    let cleanup: void | (() => void);
    try {
      cleanup = run(el, listeners);
    } catch (err) {
      el.textContent = `Plugin error: ${String(err)}`;
    }
    return () => {
      try {
        cleanup?.();
      } catch {
        // Plugin cleanup errors are not ours to surface.
      }
      for (const fn of listeners) f.listeners.delete(fn);
      el.replaceChildren();
    };
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function PluginTab(props: Props) {
  if (props.plugin.renderTab) return <WholeTab {...props} />;
  return <PluginList {...props} />;
}

function PluginList({ plugin, events, runLabel, filterRef, call, selected, onSelect }: Props) {
  const cells = useCallback(
    (e: DevEvent) => (
      <>
        <span role="gridcell" className="text-muted-foreground">
          {formatTime(e.ts)}
        </span>
        <span role="gridcell" className="truncate font-semibold">
          {e.kind}
        </span>
        <span role="gridcell" className="truncate text-muted-foreground">
          {runLabel(e.run)}
        </span>
        <span role="gridcell" className="truncate">
          {summary(plugin, e)}
        </span>
      </>
    ),
    [plugin, runLabel],
  );
  return (
    <EventList
      key={plugin.id}
      id={`plugin:${plugin.id}`}
      label={plugin.label}
      selected={selected}
      onSelect={onSelect}
      events={events}
      filterRef={filterRef}
      placeholder="Filter, e.g. words -word kind: tag:k=v"
      columns="96px minmax(120px, 200px) minmax(0, 160px) minmax(0, 1fr)"
      empty={`No events for ${plugin.label} yet.`}
      cells={cells}
      head={(e) => (
        <>
          <span className="font-mono font-semibold">{e.kind}</span>
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          <CopyButton text={() => pretty(e.data)} />
        </>
      )}
      body={(e) =>
        plugin.render ? (
          <PluginView key={e.key} plugin={plugin} event={e} events={events} call={call} />
        ) : (
          <div className="px-3 py-2">
            <JsonView value={e.data} mode="tree" />
          </div>
        )
      }
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

function PluginView(props: { plugin: DevpulPlugin; event: DevEvent; events: DevEvent[]; call: AppCall }) {
  const { plugin, event, events, call } = props;
  const ref = useRef<HTMLDivElement>(null);
  const feed = useFeed(events);
  usePluginRender(
    ref,
    (el, listeners) =>
      plugin.render?.(
        el,
        toPluginEvent(event),
        makeContext(feed, (method, params) => call(event, method, params), listeners),
      ),
    feed,
    [plugin, event, call],
  );
  return <div ref={ref} className="plugin-view px-3 py-2" />;
}

function WholeTab({ plugin, events, fallback, call }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const feed = useFeed(events);
  const target = useRef(events[0] ?? fallback);
  useEffect(() => {
    target.current = events[0] ?? fallback;
  }, [events, fallback]);
  usePluginRender(
    ref,
    (el, listeners) =>
      plugin.renderTab?.(
        el,
        makeContext(
          feed,
          (method, params) => {
            const e = target.current;
            return e ? call(e, method, params) : Promise.reject(new Error('No app has sent events for this tab.'));
          },
          listeners,
        ),
      ),
    feed,
    [plugin, call],
  );
  return <div ref={ref} className="plugin-view min-w-0 flex-1 overflow-auto px-3 py-2" />;
}
