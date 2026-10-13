import { cn } from 'cn';
import { type RefObject, useEffect, useState } from 'react';
import { CopyButton } from '../../components/Copy';
import { EventList, type Facet, type ListSelection } from '../../components/EventList';
import { codeClass } from '../../components/JsonView';
import { Section } from '../../components/Section';
import { type DevEvent, str } from '../../core/events';
import { formatTime } from '../../core/json';
import { DEVELOPER_LOG, loadFull, logObjects } from '../../core/logging';
import { rpcMessage } from '../../core/rpc';
import type { AppCall } from '../plugins/PluginTab';

interface Props extends ListSelection {
  logs: DevEvent[];
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
  call: AppCall;
}

const levelOf = (e: DevEvent) => str(e.data.level)?.toLowerCase() ?? 'info';
const nameOf = (e: DevEvent) => str(e.data.name);
const sourceOf = (e: DevEvent) => (e.data.source === DEVELOPER_LOG ? DEVELOPER_LOG : 'Devpul.log');
const FACETS: Facet[] = [
  { id: 'level', label: 'Level', of: levelOf },
  { id: 'name', label: 'Logger', of: nameOf, max: 6, prefix: 'logger' },
  { id: 'source', label: 'Source', of: sourceOf },
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
  if (key === 'source') return sourceOf(e).toLowerCase().includes(v);
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

interface Full {
  message?: string;
  error?: string;
  stack?: string;
}

// Texts the app sent in full on request, by event key, so a reopened row needs no call.
const loaded = new Map<string, Full>();
const textOf = (e: DevEvent, key: keyof Full) => loaded.get(e.key)?.[key] ?? str(e.data[key]);

/** Reads the rest of a record the VM cut, once its row is open. */
function useFull(e: DevEvent, call: AppCall): { full?: Full; failed?: string } {
  const [state, setState] = useState<{ key: string; full?: Full; failed?: string }>();
  useEffect(() => {
    const objects = logObjects(e);
    if (!objects || !e.isolateId || loaded.has(e.key)) return;
    let live = true;
    loadFull((method, params) => call(e, method, params), e.isolateId, objects).then(
      (full) => {
        loaded.set(e.key, full);
        if (live) setState({ key: e.key, full });
      },
      (err: unknown) => live && setState({ key: e.key, failed: rpcMessage(err) }),
    );
    return () => {
      live = false;
    };
  }, [e, call]);
  if (loaded.has(e.key)) return { full: loaded.get(e.key) };
  return state?.key === e.key ? state : {};
}

function Body({ e, call, runLabel }: { e: DevEvent; call: AppCall; runLabel: (run: string) => string }) {
  const { full, failed } = useFull(e, call);
  const pending = logObjects(e) && !full;
  const error = full?.error ?? str(e.data.error);
  const stack = full?.stack ?? str(e.data.stack);
  return (
    <>
      <Section id="log-message" title="Message">
        <pre className={codeClass}>{full?.message ?? str(e.data.message) ?? ''}</pre>
        {pending && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {failed ? `Only the start of this record arrived. ${failed}` : 'Reading the full record from the app.'}
          </p>
        )}
      </Section>
      {error && (
        <Section id="log-error" title="Error">
          <pre className={codeClass}>{error}</pre>
        </Section>
      )}
      {stack && (
        <Section id="log-stack" title="Stack trace">
          <pre className={codeClass}>{stack}</pre>
        </Section>
      )}
      <p className="mx-3 my-1.5 text-xs text-muted-foreground">{runLabel(e.run)}</p>
    </>
  );
}

export function LogsTab({ logs, runLabel, filterRef, call, selected, onSelect, onBack }: Props) {
  return (
    <EventList
      id="logs"
      label="Logs"
      selected={selected}
      onSelect={onSelect}
      onBack={onBack}
      events={logs}
      filterRef={filterRef}
      placeholder="Filter, e.g. sync level:warn,error name:auth"
      keys={['level', 'name', 'source']}
      field={field}
      facets={FACETS}
      columns="96px 56px minmax(0, 140px) minmax(0, 1fr)"
      empty="No logs yet. Send them with Devpul.log or developer.log."
      cells={cells}
      head={(e) => (
        <>
          <Level e={e} />
          {nameOf(e) && <strong>{nameOf(e)}</strong>}
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          <CopyButton text={() => textOf(e, 'message') ?? ''} />
        </>
      )}
      body={(e) => <Body e={e} call={call} runLabel={runLabel} />}
    />
  );
}
