import type { RefObject } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList, type Facet } from '../../components/EventList';
import { JsonView } from '../../components/JsonView';
import type { DevEvent } from '../../core/events';
import { formatTime, pretty } from '../../core/json';

interface Props {
  events: DevEvent[];
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
}

const FACETS: Facet[] = [{ id: 'kind', label: 'Kind', of: (e) => e.kind }];

export function EventsTab({ events, runLabel, filterRef }: Props) {
  return (
    <EventList
      id="events"
      events={events}
      filterRef={filterRef}
      placeholder="Filter, e.g. cart -kind:route tag:env=qa"
      facets={FACETS}
      columns="96px minmax(120px, 220px) minmax(0, 180px) minmax(0, 1fr)"
      empty="No custom events yet. Send them with Devpul.emit."
      cells={(e) => (
        <>
          <span className="muted">{formatTime(e.ts)}</span>
          <span className="kind ellipsis">{e.kind}</span>
          <span className="muted ellipsis">{runLabel(e.run)}</span>
          <span className="muted ellipsis">{preview(e)}</span>
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
      body={(e) => (
        <div className="detail-pad">
          <JsonView value={e.data} mode="tree" />
          <p className="muted">{runLabel(e.run)}</p>
        </div>
      )}
    />
  );
}

export function preview(e: DevEvent): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e.data)) {
    parts.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    if (parts.join(', ').length > 200) break;
  }
  return parts.join(', ').slice(0, 200);
}
