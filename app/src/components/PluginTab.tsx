import { X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DevEvent } from '../lib/events';
import { formatTime } from '../lib/json';
import { type DevpulPlugin, matches, toPluginEvent } from '../lib/plugins';
import { JsonView } from './JsonView';
import { VirtualList } from './VirtualList';

const ROW = 26;

interface Props {
  plugin: DevpulPlugin;
  events: DevEvent[];
}

export function PluginTab({ plugin, events }: Props) {
  const mine = useMemo(() => events.filter((e) => matches(plugin, e.kind)), [plugin, events]);
  const [selected, setSelected] = useState<DevEvent | null>(null);

  return (
    <div className={`pane-split ${selected ? 'has-detail' : ''}`}>
      <div className="pane-main">
        {mine.length === 0 ? (
          <div className="muted empty">No events for {plugin.label} yet.</div>
        ) : (
          <VirtualList
            items={mine}
            rowHeight={ROW}
            render={(e) => (
              <div
                key={e.key}
                className={`event-row ${selected?.key === e.key ? 'selected' : ''}`}
                style={{ height: ROW }}
                onClick={() => setSelected(e)}
              >
                <span className="muted">{formatTime(e.ts)}</span>
                <span className="kind">{e.kind}</span>
                <span className="ellipsis">{summary(plugin, e)}</span>
              </div>
            )}
          />
        )}
      </div>
      {selected && (
        <aside className="detail" aria-label={`${plugin.label} detail`}>
          <div className="detail-head">
            <span className="kind">{selected.kind}</span>
            <span className="grow" />
            <button
              type="button"
              className="btn small icon"
              onClick={() => setSelected(null)}
              aria-label="Close detail"
            >
              <X size={14} />
            </button>
          </div>
          <div className="detail-scroll">
            {plugin.render ? (
              <PluginView key={selected.key} plugin={plugin} event={selected} />
            ) : (
              <JsonView value={selected.data} />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function summary(plugin: DevpulPlugin, e: DevEvent): string {
  try {
    return plugin.summarize?.(toPluginEvent(e)) ?? '';
  } catch {
    return '';
  }
}

function PluginView({ plugin, event }: { plugin: DevpulPlugin; event: DevEvent }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !plugin.render) return;
    let cleanup: void | (() => void);
    try {
      cleanup = plugin.render(el, toPluginEvent(event));
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
  }, [plugin, event]);
  return <div ref={ref} />;
}
