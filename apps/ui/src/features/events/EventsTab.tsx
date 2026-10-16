import { type RefObject, useCallback } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList, type Facet, type ListSelection } from '../../components/EventList';
import { Chip } from '../../components/list';
import { JsonModeToggle, JsonView } from '../../components/JsonView';
import { type DevEvent, preview } from '../../core/events';
import { formatTime, pretty } from '../../core/json';

interface Props extends ListSelection {
  events: DevEvent[];
  runLabel: (run: string) => string;
  /** Events from more than one app run are listed. */
  multiRun: boolean;
  /** `lifecycle` events, listed only when [onLifecycle] turns them on. */
  lifecycle: { on: boolean; count: number };
  onLifecycle: (on: boolean) => void;
  filterRef: RefObject<HTMLInputElement | null>;
}

const FACETS: Facet[] = [{ id: 'kind', label: 'Kind', of: (e) => e.kind }];

export function EventsTab(props: Props) {
  const { events, runLabel, multiRun, lifecycle, onLifecycle, filterRef, selected, onSelect, onBack } = props;
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
        <span role="gridcell" className="truncate text-muted-foreground">
          {preview(e)}
        </span>
      </>
    ),
    [runLabel, multiRun],
  );
  return (
    <EventList
      id="events"
      label="Events"
      selected={selected}
      onSelect={onSelect}
      onBack={onBack}
      events={events}
      filterRef={filterRef}
      placeholder="Filter, e.g. cart -kind:route tag:env=qa"
      facets={FACETS}
      actions={
        lifecycle.count > 0 && (
          <Chip on={lifecycle.on} onClick={() => onLifecycle(!lifecycle.on)}>
            Lifecycle {lifecycle.count}
          </Chip>
        )
      }
      columns={`96px minmax(120px, 220px)${multiRun ? ' minmax(0, 180px)' : ''} minmax(0, 1fr)`}
      empty="No custom events yet. Send them with Devpul.emit."
      cells={cells}
      head={(e) => (
        <>
          <span className="font-mono font-semibold">{e.kind}</span>
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          <JsonModeToggle />
          <CopyButton text={() => pretty(e.data)} />
        </>
      )}
      body={(e) => (
        <div className="px-3 py-2">
          <JsonView value={e.data} />
          <p className="my-[1em] text-muted-foreground">{runLabel(e.run)}</p>
        </div>
      )}
    />
  );
}
