import { type RefObject, useCallback } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList, type Facet, type ListSelection } from '../../components/EventList';
import { JsonView } from '../../components/JsonView';
import type { DevEvent } from '../../core/events';
import { formatTime, pretty } from '../../core/json';

interface Props extends ListSelection {
  events: DevEvent[];
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
}

const FACETS: Facet[] = [{ id: 'kind', label: 'Kind', of: (e) => e.kind }];

export function EventsTab({ events, runLabel, filterRef, selected, onSelect }: Props) {
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
        <span role="gridcell" className="truncate text-muted-foreground">
          {preview(e)}
        </span>
      </>
    ),
    [runLabel],
  );
  return (
    <EventList
      id="events"
      label="Events"
      selected={selected}
      onSelect={onSelect}
      events={events}
      filterRef={filterRef}
      placeholder="Filter, e.g. cart -kind:route tag:env=qa"
      facets={FACETS}
      columns="96px minmax(120px, 220px) minmax(0, 180px) minmax(0, 1fr)"
      empty="No custom events yet. Send them with Devpul.emit."
      cells={cells}
      head={(e) => (
        <>
          <span className="font-mono font-semibold">{e.kind}</span>
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          <CopyButton text={() => pretty(e.data)} />
        </>
      )}
      body={(e) => (
        <div className="px-3 py-2">
          <JsonView value={e.data} mode="tree" />
          <p className="my-[1em] text-muted-foreground">{runLabel(e.run)}</p>
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
