import { X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { DevEvent } from '../lib/events';
import { matchesTerms, parseTerms } from '../lib/filter';
import { formatTime } from '../lib/json';
import { load, save } from '../lib/storage';
import { JsonView } from './JsonView';
import { VirtualList } from './VirtualList';

const ROW = 26;

interface Props {
  events: DevEvent[];
  runLabel: (run: string) => string;
}

export function EventsTab({ events, runLabel }: Props) {
  const [text, setText] = useState(() => load('eventsFilter', ''));
  const [selected, setSelected] = useState<DevEvent | null>(null);
  const filtered = useMemo(() => {
    const terms = parseTerms(text);
    if (!terms.include.length && !terms.exclude.length) return events;
    return events.filter((e) =>
      matchesTerms(`${e.kind}\n${JSON.stringify(e.data)}`.toLowerCase(), terms),
    );
  }, [events, text]);

  return (
    <div className={`pane-split ${selected ? 'has-detail' : ''}`}>
      <div className="pane-main">
        <div className="toolbar">
          <input
            className="filter"
            type="search"
            placeholder="Filter: words AND, -word excludes (kind, data)"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              save('eventsFilter', e.target.value);
            }}
            aria-label="Filter events"
          />
        </div>
        {filtered.length === 0 ? (
          <div className="muted empty">
            {events.length ? 'No events match the filter.' : 'No custom events yet. Send them with Devpul.emit.'}
          </div>
        ) : (
          <VirtualList
            items={filtered}
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
                <span className="muted ellipsis">{runLabel(e.run)}</span>
                <span className="muted ellipsis">{preview(e)}</span>
              </div>
            )}
          />
        )}
      </div>
      {selected && (
        <aside className="detail" aria-label="Event detail">
          <div className="detail-head">
            <span className="kind">{selected.kind}</span>
            <span className="muted">{formatTime(selected.ts)}</span>
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
            <JsonView value={selected.data} />
          </div>
        </aside>
      )}
    </div>
  );
}

const ENVELOPE = new Set(['v', 'session', 'seq', 'ts', 'tags']);

function preview(e: DevEvent): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e.data)) {
    if (ENVELOPE.has(k)) continue;
    parts.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    if (parts.join(', ').length > 200) break;
  }
  return parts.join(', ').slice(0, 200);
}
