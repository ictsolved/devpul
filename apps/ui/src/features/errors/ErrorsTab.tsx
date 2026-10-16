import { Route } from 'lucide-react';
import { type RefObject, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '../../components/Copy';
import { EventList, type Facet, type Group, type ListSelection } from '../../components/EventList';
import { codeClass } from '../../components/JsonView';
import { Section } from '../../components/Section';
import { SourceLink, StackText } from '../../components/Stack';
import { breadcrumbs, type Crumb, formatOffset } from '../../core/breadcrumbs';
import { type DevEvent, str } from '../../core/events';
import { formatTime } from '../../core/json';
import { locationText, readLocation, type SourceLocation, shortPath } from '../../core/location';
import type { Store } from '../../core/store';
import { Method, StatusBadge } from '../http/DetailPanel';

const noteClass = 'mx-3 my-1.5 text-xs text-muted-foreground';

interface Props extends ListSelection {
  errors: DevEvent[];
  store: Store;
  runLabel: (run: string) => string;
  filterRef: RefObject<HTMLInputElement | null>;
  onOpen: (crumb: Crumb) => void;
  onSource: (e: DevEvent, location: SourceLocation) => void;
}

const sourceOf = (e: DevEvent) => str(e.data.source) ?? 'error';
const typeOf = (e: DevEvent) => str(e.data.type) ?? 'Error';
const routeOf = (e: DevEvent) => str(e.data.route);
// The type has its own cell; Dart's toString often repeats it.
const messageOf = (e: DevEvent) => {
  const message = str(e.data.message) ?? '';
  const prefix = `${typeOf(e)}: `;
  return message.startsWith(prefix) ? message.slice(prefix.length) : message;
};
const groupKey = (e: DevEvent) => `${typeOf(e)}|${str(e.data.message) ?? ''}`;
const FACETS: Facet[] = [{ id: 'source', label: 'Source', of: sourceOf }];

function field(e: DevEvent, key: string, value: string): boolean {
  const v = value.toLowerCase();
  if (key === 'source') return sourceOf(e).toLowerCase() === v;
  if (key === 'type') return typeOf(e).toLowerCase().includes(v);
  if (key === 'route') return routeOf(e)?.toLowerCase().includes(v) ?? false;
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
    routeOf(e) && `Route: ${routeOf(e)}`,
    str(d.context),
    str(d.information),
    str(d.stack),
  ]
    .filter(Boolean)
    .join('\n\n');
}

function Widget({ e, onSource }: { e: DevEvent; onSource: Props['onSource'] }) {
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
          <span className="truncate" title={locationText(location)}>
            <SourceLink location={location} onOpen={(l) => onSource(e, l)}>
              {shortPath(location.file)}:{location.line}:{location.column}
            </SourceLink>
          </span>
        )}
      </div>
    </Section>
  );
}

const crumbClass =
  'grid w-full cursor-pointer grid-cols-[88px_56px_minmax(0,1fr)] gap-2 rounded px-1 py-[3px] text-left font-mono text-xs hover:bg-secondary';

function Breadcrumbs({ e, store, onOpen }: { e: DevEvent; store: Store; onOpen: (crumb: Crumb) => void }) {
  const crumbs = breadcrumbs(store.all, store.httpRows, e);
  return (
    <Section id="err-crumbs" title="Before this error" summary={String(crumbs.length)}>
      {crumbs.length === 0 ? (
        <div className="text-muted-foreground">Nothing earlier in this run.</div>
      ) : (
        <ul aria-label="Breadcrumbs">
          {crumbs.map((c) => (
            <li key={`${c.kind}|${c.key}`}>
              <button type="button" className={crumbClass} title={formatTime(c.ts)} onClick={() => onOpen(c)}>
                <span className="text-right whitespace-nowrap text-muted-foreground">{formatOffset(c.offset)}</span>
                {c.row ? (
                  <>
                    <Method method={c.row.method} />
                    <span className="flex min-w-0 gap-2">
                      <StatusBadge row={c.row} />
                      <span className="truncate">{c.row.url}</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-muted-foreground">{c.kind}</span>
                    <span className="truncate">{c.text}</span>
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

export function ErrorsTab({ errors, store, runLabel, filterRef, onOpen, onSource, selected, onSelect }: Props) {
  const multiRun = store.runs.size > 1;
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
        <span role="gridcell" className="truncate">
          <span className="font-semibold">{typeOf(e)}</span> {messageOf(e)}
        </span>
        <span role="gridcell" className="text-right text-muted-foreground">
          {group && group.count > 1 ? `x${group.count}` : ''}
        </span>
        {multiRun && (
          <span role="gridcell" className="truncate text-muted-foreground">
            {runLabel(e.run)}
          </span>
        )}
      </>
    ),
    [runLabel, multiRun],
  );

  return (
    <EventList
      id="errors"
      label="Errors"
      selected={selected}
      onSelect={onSelect}
      events={errors}
      filterRef={filterRef}
      placeholder="Filter, e.g. timeout source:flutter route:cart"
      keys={['source', 'type', 'route']}
      field={field}
      facets={FACETS}
      groupBy={groupKey}
      columns={`96px 128px minmax(0, 1fr) 40px${multiRun ? ' minmax(0, 120px)' : ''}`}
      empty="No errors yet."
      cells={cells}
      head={(e) => (
        <>
          <Source e={e} />
          <strong>{typeOf(e)}</strong>
          {str(e.data.library) && <span className="text-muted-foreground">{str(e.data.library)}</span>}
          {routeOf(e) && (
            <span className="flex min-w-0 items-center gap-1 text-muted-foreground" title="Route at the error">
              <Route size={12} aria-hidden="true" />
              <span className="truncate font-mono">{routeOf(e)}</span>
            </span>
          )}
          <span className="text-muted-foreground">{formatTime(e.ts)}</span>
          <span className="flex-1" />
          <CopyButton text={() => report(e)} label="Copy all" />
        </>
      )}
      body={(e, group) => {
        const d = e.data;
        const stack = str(d.stack);
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
            <Widget e={e} onSource={onSource} />
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
                <StackText stack={stack} onOpen={(l) => onSource(e, l)} />
              </Section>
            )}
            <Breadcrumbs e={e} store={store} onOpen={onOpen} />
            <p className={noteClass}>{runLabel(e.run)}</p>
          </>
        );
      }}
    />
  );
}
