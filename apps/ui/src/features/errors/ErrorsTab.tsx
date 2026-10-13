import { type RefObject, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '../../components/Copy';
import { EventList, type Facet, type Group, type ListSelection } from '../../components/EventList';
import { codeClass } from '../../components/JsonView';
import { Section } from '../../components/Section';
import { type DevEvent, str } from '../../core/events';
import { formatTime } from '../../core/json';
import { locationText, readLocation, shortPath } from '../../core/location';
import type { HttpRow } from '../../core/store';
import { Method, StatusBadge } from '../http/DetailPanel';

const noteClass = 'mx-3 my-1.5 text-xs text-muted-foreground';
const NEAR_BEFORE = 10_000;
const NEAR_AFTER = 1_000;

interface Props extends ListSelection {
  errors: DevEvent[];
  requests: readonly HttpRow[];
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
  onOpenRequest: (key: string) => void;
}

const sourceOf = (e: DevEvent) => str(e.data.source) ?? 'error';
const typeOf = (e: DevEvent) => str(e.data.type) ?? 'Error';
const groupKey = (e: DevEvent) => `${typeOf(e)}|${str(e.data.message) ?? ''}`;
const FACETS: Facet[] = [{ id: 'source', label: 'Source', of: sourceOf }];

function field(e: DevEvent, key: string, value: string): boolean {
  const v = value.toLowerCase();
  if (key === 'source') return sourceOf(e).toLowerCase() === v;
  if (key === 'type') return typeOf(e).toLowerCase().includes(v);
  return false;
}

function Source({ e }: { e: DevEvent }) {
  return <Badge className="rounded-sm bg-destructive-soft text-destructive">{sourceOf(e)}</Badge>;
}

function widgetText(e: DevEvent): string | undefined {
  const widget = str(e.data.widget);
  const location = readLocation(e.data.location);
  if (!widget) return undefined;
  return location ? `${widget} at ${locationText(location)}` : widget;
}

function report(e: DevEvent): string {
  const d = e.data;
  const widget = widgetText(e);
  return [
    `${typeOf(e)}: ${str(d.message) ?? ''}`,
    widget && `Widget: ${widget}`,
    str(d.context),
    str(d.information),
    str(d.stack),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function Widget({ e }: { e: DevEvent }) {
  const widget = str(e.data.widget);
  const location = readLocation(e.data.location);
  if (!widget) return null;
  return (
    <Section
      id="err-widget"
      title="Widget"
      actions={location && <CopyButton text={() => locationText(location)} label="Copy location" />}
    >
      <div className="flex min-w-0 gap-2 font-mono text-xs">
        <span className="font-semibold">{widget}</span>
        {location && (
          <span className="truncate text-muted-foreground" title={locationText(location)}>
            {shortPath(location.file)}:{location.line}:{location.column}
          </span>
        )}
      </div>
    </Section>
  );
}

export function ErrorsTab({ errors, requests, runLabel, filterRef, onOpenRequest, selected, onSelect }: Props) {
  const near = (e: DevEvent) =>
    requests.filter((r) => r.run === e.run && r.ts >= e.ts - NEAR_BEFORE && r.ts <= e.ts + NEAR_AFTER).slice(0, 8);
  const cells = useCallback(
    (e: DevEvent, group?: Group) => (
      <>
        <span role="gridcell" className="text-muted-foreground">
          {formatTime(e.ts)}
        </span>
        <span role="gridcell">
          <Source e={e} />
          {e.data.silent === true && (
            <Badge variant="secondary" className="ml-1 rounded-sm text-muted-foreground">
              silent
            </Badge>
          )}
        </span>
        <span role="gridcell" className="truncate font-semibold">
          {typeOf(e)}
        </span>
        <span role="gridcell" className="truncate">
          {str(e.data.message) ?? ''}
        </span>
        <span role="gridcell" className="text-right text-muted-foreground">
          {group && group.count > 1 ? `x${group.count}` : ''}
        </span>
        <span role="gridcell" className="truncate text-muted-foreground">
          {runLabel(e.run)}
        </span>
      </>
    ),
    [runLabel],
  );

  return (
    <EventList
      id="errors"
      label="Errors"
      selected={selected}
      onSelect={onSelect}
      events={errors}
      filterRef={filterRef}
      placeholder="Filter, e.g. timeout source:flutter type:State"
      keys={['source', 'type']}
      field={field}
      facets={FACETS}
      groupBy={groupKey}
      columns="96px 128px minmax(80px, 160px) minmax(0, 1fr) 40px minmax(0, 120px)"
      empty="No errors yet."
      cells={cells}
      head={(e) => (
        <>
          <Source e={e} />
          <strong>{typeOf(e)}</strong>
          {str(e.data.library) && <span className="text-muted-foreground">{str(e.data.library)}</span>}
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          <CopyButton text={() => report(e)} label="Copy all" />
        </>
      )}
      body={(e, group) => {
        const d = e.data;
        const stack = str(d.stack);
        const nearby = near(e);
        return (
          <>
            {group && group.count > 1 && (
              <p className={noteClass}>
                {group.count} times since {formatTime(group.first)}. Showing the latest.
              </p>
            )}
            <Section id="err-message" title="Message">
              <pre className={codeClass}>{str(d.message) ?? ''}</pre>
            </Section>
            <Widget e={e} />
            {str(d.context) && (
              <Section id="err-context" title="Context">
                <div>{str(d.context)}</div>
              </Section>
            )}
            {str(d.information) && (
              <Section id="err-information" title="Diagnostics">
                <pre className={codeClass}>{str(d.information)}</pre>
              </Section>
            )}
            {stack && (
              <Section id="err-stack" title="Stack trace" actions={<CopyButton text={() => stack} />}>
                <pre className={codeClass}>{stack}</pre>
              </Section>
            )}
            <Section id="err-near" title="Requests around this time" summary={String(nearby.length)}>
              {nearby.length === 0 ? (
                <div className="text-muted-foreground">None in the 10 s before.</div>
              ) : (
                <ul>
                  {nearby.map((r) => (
                    <li key={r.key}>
                      <button
                        type="button"
                        className="grid w-full cursor-pointer grid-cols-[96px_56px_56px_minmax(0,1fr)] gap-2 rounded px-1 py-[3px] text-left font-mono text-xs hover:bg-secondary"
                        onClick={() => onOpenRequest(r.key)}
                      >
                        <span className="text-muted-foreground">{formatTime(r.ts)}</span>
                        <Method method={r.method} />
                        <StatusBadge row={r} />
                        <span className="truncate">{r.url}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <p className={noteClass}>{runLabel(e.run)}</p>
          </>
        );
      }}
    />
  );
}
