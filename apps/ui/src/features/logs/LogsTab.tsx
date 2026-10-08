import { cn } from 'cn';
import type { RefObject } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList, type Facet, type ListSelection } from '../../components/EventList';
import { codeClass } from '../../components/JsonView';
import { Section } from '../../components/Section';
import { type DevEvent, str } from '../../core/events';
import { formatTime } from '../../core/json';

interface Props extends ListSelection {
  logs: DevEvent[];
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
}

const levelOf = (e: DevEvent) => str(e.data.level)?.toLowerCase() ?? 'info';
const nameOf = (e: DevEvent) => str(e.data.name);
const FACETS: Facet[] = [
  { id: 'level', label: 'Level', of: levelOf },
  { id: 'name', label: 'Logger', of: nameOf, max: 6, prefix: 'logger' },
];

const LEVEL_COLORS: Record<string, string> = {
  info: 'text-primary',
  warn: 'text-warning',
  warning: 'text-warning',
  error: 'text-destructive',
  severe: 'text-destructive',
  shout: 'text-destructive',
  fatal: 'text-destructive',
};

function Level({ e }: { e: DevEvent }) {
  const level = levelOf(e);
  return <span className={cn('font-mono font-semibold text-muted-foreground', LEVEL_COLORS[level])}>{level}</span>;
}

function field(e: DevEvent, key: string, value: string): boolean {
  const v = value.toLowerCase();
  if (key === 'level') return levelOf(e) === v;
  if (key === 'name') return nameOf(e)?.toLowerCase().includes(v) ?? false;
  return false;
}

function cells(e: DevEvent) {
  return (
    <>
      <span role="gridcell" className="text-muted-foreground">
        {formatTime(e.ts)}
      </span>
      <span role="gridcell">
        <Level e={e} />
      </span>
      <span role="gridcell" className="truncate text-muted-foreground">
        {nameOf(e) ?? ''}
      </span>
      <span role="gridcell" className="truncate">
        {str(e.data.message) ?? ''}
      </span>
    </>
  );
}

export function LogsTab({ logs, runLabel, filterRef, selected, onSelect }: Props) {
  return (
    <EventList
      id="logs"
      label="Logs"
      selected={selected}
      onSelect={onSelect}
      events={logs}
      filterRef={filterRef}
      placeholder="Filter, e.g. sync level:warn,error name:auth"
      keys={['level', 'name']}
      field={field}
      facets={FACETS}
      columns="96px 56px minmax(0, 140px) minmax(0, 1fr)"
      empty="No logs yet. Send them with Devpul.log."
      cells={cells}
      head={(e) => (
        <>
          <Level e={e} />
          {nameOf(e) && <strong>{nameOf(e)}</strong>}
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          <CopyButton text={() => str(e.data.message) ?? ''} />
        </>
      )}
      body={(e) => (
        <>
          <Section id="log-message" title="Message">
            <pre className={codeClass}>{str(e.data.message) ?? ''}</pre>
          </Section>
          {str(e.data.error) && (
            <Section id="log-error" title="Error">
              <pre className={codeClass}>{str(e.data.error)}</pre>
            </Section>
          )}
          {str(e.data.stack) && (
            <Section id="log-stack" title="Stack trace">
              <pre className={codeClass}>{str(e.data.stack)}</pre>
            </Section>
          )}
          <p className="mx-3 my-1.5 text-xs text-muted-foreground">{runLabel(e.run)}</p>
        </>
      )}
    />
  );
}
