import { type RefObject, useEffect, useRef } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList } from '../../components/EventList';
import { JsonView } from '../../components/JsonView';
import type { DevEvent } from '../../core/events';
import { formatTime, pretty } from '../../core/json';
import { pluginUi } from './pluginUi';
import { type DevpulPlugin, type PluginContext, type PluginEvent, toPluginEvent } from './plugins';

export type AppCall = (e: DevEvent, method: string, params?: Record<string, unknown>) => Promise<unknown>;

interface Props {
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
  const { plugin, events, runLabel, filterRef, call } = props;
  return (
    <EventList
      key={plugin.id}
      id={`plugin:${plugin.id}`}
      events={events}
      filterRef={filterRef}
      placeholder="Filter, e.g. words -word kind: tag:k=v"
      columns="96px minmax(120px, 200px) minmax(0, 160px) minmax(0, 1fr)"
      empty={`No events for ${plugin.label} yet.`}
      cells={(e) => (
        <>
          <span className="muted">{formatTime(e.ts)}</span>
          <span className="kind ellipsis">{e.kind}</span>
          <span className="muted ellipsis">{runLabel(e.run)}</span>
          <span className="ellipsis">{summary(plugin, e)}</span>
        </>
      )}
      head={(e) => (
        <>
          <span className="kind">{e.kind}</span>
          <span className="muted">{formatTime(e.ts)}</span>
          <span className="grow" />
          <CopyButton text={() => pretty(e.data)} />
        </>
      )}
      body={(e) =>
        plugin.render ? (
          <PluginView key={e.key} plugin={plugin} event={e} events={events} call={call} />
        ) : (
          <div className="detail-pad">
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
  return <div ref={ref} className="detail-pad plugin-view" />;
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
  return <div ref={ref} className="plugin-tab plugin-view" />;
}
