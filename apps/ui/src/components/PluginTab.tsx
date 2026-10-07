import { type RefObject, useEffect, useRef } from 'react';
import type { DevEvent } from '../lib/events';
import { formatTime, pretty } from '../lib/json';
import { type DevpulPlugin, type PluginContext, toPluginEvent } from '../lib/plugins';
import { CopyButton } from './Copy';
import { EventList } from './EventList';
import { JsonView } from './JsonView';

export type AppCall = (
  e: DevEvent,
  method: string,
  params?: Record<string, unknown>,
) => Promise<unknown>;

interface Props {
  plugin: DevpulPlugin;
  /** The plugin's events, newest first. */
  events: DevEvent[];
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
  call: AppCall;
}

export function PluginTab({ plugin, events, runLabel, filterRef, call }: Props) {
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

function PluginView(props: {
  plugin: DevpulPlugin;
  event: DevEvent;
  events: DevEvent[];
  call: AppCall;
}) {
  const { plugin, event, events, call } = props;
  const ref = useRef<HTMLDivElement>(null);
  // Read when the plugin asks, so new events do not re-render it.
  const all = useRef(events);
  useEffect(() => {
    all.current = events;
  }, [events]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !plugin.render) return;
    const context: PluginContext = {
      get events() {
        return all.current.toReversed().map(toPluginEvent);
      },
      call: (method, params) => call(event, method, params),
    };
    let cleanup: void | (() => void);
    try {
      cleanup = plugin.render(el, toPluginEvent(event), context);
    } catch (err) {
      el.textContent = `Plugin error: ${String(err)}`;
    }
    return () => {
      try {
        cleanup?.();
      } catch {
        // Plugin cleanup errors are not ours to surface.
      }
      el.replaceChildren();
    };
  }, [plugin, event, call]);
  return <div ref={ref} className="detail-pad plugin-view" />;
}
