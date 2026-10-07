import type { RefObject } from 'react';
import { type DevEvent, str } from '../lib/events';
import { formatTime } from '../lib/json';
import type { HttpRow } from '../lib/store';
import { CopyButton } from './Copy';
import { StatusBadge } from './DetailPanel';
import { EventList, type Facet } from './EventList';
import { Section } from './Section';

const NEAR_BEFORE = 10_000;
const NEAR_AFTER = 1_000;

interface Props {
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

function report(e: DevEvent): string {
  const d = e.data;
  return [
    `${typeOf(e)}: ${str(d.message) ?? ''}`,
    str(d.context),
    str(d.information),
    str(d.stack),
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function ErrorsTab({ errors, requests, runLabel, filterRef, onOpenRequest }: Props) {
  const near = (e: DevEvent) =>
    requests
      .filter((r) => r.run === e.run && r.ts >= e.ts - NEAR_BEFORE && r.ts <= e.ts + NEAR_AFTER)
      .slice(0, 8);

  return (
    <EventList
      id="errors"
      events={errors}
      filterRef={filterRef}
      placeholder="Filter, e.g. timeout source:flutter type:State"
      keys={['source', 'type']}
      field={field}
      facets={FACETS}
      groupBy={groupKey}
      columns="96px 72px minmax(80px, 200px) minmax(0, 1fr) 40px minmax(0, 160px)"
      empty="No errors yet."
      cells={(e, group) => (
        <>
          <span className="muted">{formatTime(e.ts)}</span>
          <span>
            <span className="badge err">{sourceOf(e)}</span>
            {e.data.silent === true && <span className="badge"> silent</span>}
          </span>
          <span className="kind ellipsis">{typeOf(e)}</span>
          <span className="ellipsis">{str(e.data.message) ?? ''}</span>
          <span className="num muted">{group && group.count > 1 ? `x${group.count}` : ''}</span>
          <span className="muted ellipsis">{runLabel(e.run)}</span>
        </>
      )}
      head={(e) => (
        <>
          <span className="badge err">{sourceOf(e)}</span>
          <strong>{typeOf(e)}</strong>
          {str(e.data.library) && <span className="muted">{str(e.data.library)}</span>}
          <span className="muted">{formatTime(e.ts)}</span>
          <span className="grow" />
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
              <p className="detail-note muted">
                {group.count} times since {formatTime(group.first)}. Showing the latest.
              </p>
            )}
            <Section id="err-message" title="Message">
              <pre className="code">{str(d.message) ?? ''}</pre>
            </Section>
            {str(d.context) && (
              <Section id="err-context" title="Context">
                <div>{str(d.context)}</div>
              </Section>
            )}
            {str(d.information) && (
              <Section id="err-information" title="Diagnostics">
                <pre className="code">{str(d.information)}</pre>
              </Section>
            )}
            {stack && (
              <Section id="err-stack" title="Stack trace" actions={<CopyButton text={() => stack} />}>
                <pre className="code">{stack}</pre>
              </Section>
            )}
            <Section id="err-near" title="Requests around this time" summary={String(nearby.length)}>
              {nearby.length === 0 ? (
                <div className="muted">None in the 10 s before.</div>
              ) : (
                <ul className="near">
                  {nearby.map((r) => (
                    <li key={r.key}>
                      <button type="button" className="link-row" onClick={() => onOpenRequest(r.key)}>
                        <span className="muted">{formatTime(r.ts)}</span>
                        <span className={`method m-${r.method}`}>{r.method}</span>
                        <StatusBadge row={r} />
                        <span className="ellipsis">{r.url}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
            <p className="detail-note muted">{runLabel(e.run)}</p>
          </>
        );
      }}
    />
  );
}
