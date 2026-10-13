import { type DevEvent, preview, str } from './events';
import type { HttpRow } from './store';

export type CrumbKind = 'route' | 'log' | 'event' | 'request';

export interface Crumb {
  kind: CrumbKind;
  /** The event key, or the HTTP row key for a request. */
  key: string;
  ts: number;
  /** Milliseconds before the error. */
  offset: number;
  text: string;
  event?: DevEvent;
  row?: HttpRow;
}

export const MAX_CRUMBS = 30;

type Point = { ts: number; session: string; seq: number };

// Within one session seq decides; across sessions (developer.log, HTTP profile) the clock does.
const before = (a: Point, b: Point) => a.ts < b.ts || (a.ts === b.ts && (a.session !== b.session || a.seq < b.seq));

const newestFirst = (a: Crumb, b: Crumb) => {
  const x = a.event ?? a.row;
  const y = b.event ?? b.row;
  return b.ts - a.ts || (x && y && x.session === y.session ? y.seq - x.seq : 0);
};

const kindOf = (e: DevEvent): CrumbKind | null =>
  e.kind === 'route'
    ? 'route'
    : e.kind === 'log'
      ? 'log'
      : e.kind === 'error' || e.kind.startsWith('app.') || e.kind.startsWith('http.')
        ? null
        : 'event';

/** The routes, logs, events and requests of the error's run before it, newest first. */
export function breadcrumbs(
  events: readonly DevEvent[],
  requests: readonly HttpRow[],
  error: DevEvent,
  max = MAX_CRUMBS,
): Crumb[] {
  const out: Crumb[] = [];
  for (const e of events) {
    if (e.run !== error.run || !before(e, error)) continue;
    const kind = kindOf(e);
    if (kind)
      out.push({ kind, key: e.key, ts: e.ts, offset: error.ts - e.ts, text: oneLine(eventText(kind, e)), event: e });
  }
  for (const row of requests) {
    if (row.run !== error.run || !before(row, error)) continue;
    out.push({
      kind: 'request',
      key: row.key,
      ts: row.ts,
      offset: error.ts - row.ts,
      text: oneLine(rowText(row)),
      row,
    });
  }
  return out.toSorted(newestFirst).slice(0, max);
}

function eventText(kind: CrumbKind, e: DevEvent): string {
  const d = e.data;
  if (kind === 'route') return [str(d.action), str(d.route)].filter(Boolean).join(' ');
  if (kind === 'log') return [str(d.level) ?? 'info', str(d.message) ?? ''].join(' ');
  return `${e.kind} ${preview(e, 120)}`;
}

const TEXT_MAX = 200;
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, TEXT_MAX);

const rowText = (r: HttpRow) =>
  [r.method, r.state === 'error' ? 'failed' : r.state === 'pending' ? 'pending' : r.status, r.url]
    .filter((x) => x !== undefined && x !== '')
    .join(' ');

/** As `-1.2 s` or `-340 ms`. */
export function formatOffset(ms: number): string {
  if (ms < 1000) return `-${ms} ms`;
  if (ms < 60_000) return `-${(ms / 1000).toFixed(1)} s`;
  return `-${Math.floor(ms / 60_000)} min ${Math.floor((ms % 60_000) / 1000)} s`;
}
