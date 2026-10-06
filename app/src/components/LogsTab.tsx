import type { RefObject } from 'react';
import { type DevEvent, str } from '../lib/events';
import { formatTime } from '../lib/json';
import { CopyButton } from './Copy';
import { EventList, type Facet } from './EventList';
import { Section } from './Section';

interface Props {
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

function field(e: DevEvent, key: string, value: string): boolean {
  const v = value.toLowerCase();
  if (key === 'level') return levelOf(e) === v;
  if (key === 'name') return nameOf(e)?.toLowerCase().includes(v) ?? false;
  return false;
}

export function LogsTab({ logs, runLabel, filterRef }: Props) {
  return (
    <EventList
      id="logs"
      events={logs}
      filterRef={filterRef}
      placeholder="Filter, e.g. sync level:warn,error name:auth"
      keys={['level', 'name']}
      field={field}
      facets={FACETS}
      columns="96px 56px minmax(0, 140px) minmax(0, 1fr)"
      empty="No logs yet. Send them with Devpul.log."
      cells={(e) => (
        <>
          <span className="muted">{formatTime(e.ts)}</span>
          <span className={`level lvl-${levelOf(e)}`}>{levelOf(e)}</span>
          <span className="muted ellipsis">{nameOf(e) ?? ''}</span>
          <span className="ellipsis">{str(e.data.message) ?? ''}</span>
        </>
      )}
      head={(e) => (
        <>
          <span className={`level lvl-${levelOf(e)}`}>{levelOf(e)}</span>
          {nameOf(e) && <strong>{nameOf(e)}</strong>}
          <span className="muted">{formatTime(e.ts)}</span>
          <span className="grow" />
          <CopyButton text={() => str(e.data.message) ?? ''} />
        </>
      )}
      body={(e) => (
        <>
          <Section id="log-message" title="Message">
            <pre className="code">{str(e.data.message) ?? ''}</pre>
          </Section>
          {str(e.data.error) && (
            <Section id="log-error" title="Error">
              <pre className="code">{str(e.data.error)}</pre>
            </Section>
          )}
          {str(e.data.stack) && (
            <Section id="log-stack" title="Stack trace">
              <pre className="code">{str(e.data.stack)}</pre>
            </Section>
          )}
          <p className="detail-note muted">{runLabel(e.run)}</p>
        </>
      )}
    />
  );
}
