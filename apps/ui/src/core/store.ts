import { type DevEvent, isObject, type JsonObject, num, str, TRUNCATED } from './events';

export type HttpState = 'pending' | 'done' | 'error';

export interface HttpRow {
  key: string;
  run: string;
  session: string;
  id: string;
  method: string;
  url: string;
  host: string;
  request?: DevEvent;
  response?: DevEvent;
  error?: DevEvent;
  ts: number;
  seq: number;
  status?: number;
  durationMs?: number;
  /** Response body bytes, from content-length or the body itself. */
  size?: number;
  state: HttpState;
}

export interface RunInfo {
  run: string;
  conn: string;
  first: number;
  last: number;
  session?: DevEvent;
  /** Latest `app.info` event of the run. */
  info?: DevEvent;
}

/** A tab's selected item, and the item it was opened from, if any. */
export interface Selection {
  key: string;
  from?: { tab: string; key: string };
}

// Enough for the sessions a backlog can still return.
const MAX_CLEARED = 100;

// Three full app backlogs (16 MB each), or 10k typical events plus a 5 MB body with room to spare.
export const DEFAULT_MAX_MB = 50;

// `app.*` events are small and carry a run's name, actions and plugins; the cap leaves them, as the app's limits do.
export const evictable = (e: DevEvent): boolean => !e.kind.startsWith('app.');

const byNewest = (a: { ts: number; seq: number }, b: { ts: number; seq: number }) => b.ts - a.ts || b.seq - a.seq;

/** The newest run of each connection; earlier ones have exited. */
export function latestRuns(runs: ReadonlyMap<string, RunInfo>): RunInfo[] {
  const best = new Map<string, RunInfo>();
  for (const r of runs.values()) {
    const prev = best.get(r.conn);
    if (!prev || r.last > prev.last) best.set(r.conn, r);
  }
  return [...best.values()];
}

export class Store {
  /** Cap on the summed `size` of kept events; oldest go first. */
  maxBytes: number;
  version = 0;
  /** Events evicted by the cap since the page loaded or the last Clear. */
  dropped = 0;
  private total = 0;

  private events = new Map<string, DevEvent>();
  private order: DevEvent[] = [];
  private http = new Map<string, HttpRow>();
  private httpSorted: HttpRow[] | null = null;
  private errorList: DevEvent[] = [];
  private errorsSnapshot: DevEvent[] | null = null;
  private otherList: DevEvent[] = [];
  private otherSnapshot: DevEvent[] | null = null;
  private logList: DevEvent[] = [];
  private logsSnapshot: DevEvent[] | null = null;
  private runMap = new Map<string, RunInfo>();
  private runsSnapshot: Map<string, RunInfo> | null = null;
  private tagMap = new Map<string, Set<string>>();
  private selection = new Map<string, Selection>();
  private cleared: Map<string, number>;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** `cleared`: the highest `seq` per session at earlier Clears. */
  constructor(maxBytes = DEFAULT_MAX_MB * 1024 * 1024, cleared: readonly [string, number][] = []) {
    this.maxBytes = maxBytes;
    this.cleared = new Map(cleared);
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getVersion = (): number => this.version;

  /** Returns the events that were not already known. */
  add(incoming: DevEvent[]): DevEvent[] {
    const added: DevEvent[] = [];
    for (const e of incoming) {
      if (this.events.has(e.key)) continue;
      this.events.set(e.key, e);
      this.order.push(e);
      this.total += e.size;
      this.index(e);
      added.push(e);
    }
    if (!added.length) return added;
    if (this.total > this.maxBytes) this.evict();
    this.changed();
    return added;
  }

  /** Drops matching events and returns them. */
  remove(pred: (e: DevEvent) => boolean): DevEvent[] {
    const gone = this.order.filter(pred);
    if (!gone.length) return [];
    this.order = this.order.filter((e) => !pred(e));
    for (const e of gone) {
      this.events.delete(e.key);
      this.total -= e.size;
    }
    this.reindex();
    this.changed();
    return gone;
  }

  setMaxBytes(maxBytes: number): void {
    this.maxBytes = maxBytes;
    if (this.total <= maxBytes) return;
    this.evict();
    this.changed();
  }

  /** Empties the store and remembers how far each session got. */
  clear(): void {
    for (const e of this.order) {
      const prev = this.cleared.get(e.session);
      this.cleared.delete(e.session);
      this.cleared.set(e.session, Math.max(prev ?? e.seq, e.seq));
    }
    for (const session of this.cleared.keys()) {
      if (this.cleared.size <= MAX_CLEARED) break;
      this.cleared.delete(session);
    }
    this.events.clear();
    this.order = [];
    this.total = 0;
    this.dropped = 0;
    this.selection.clear();
    this.reset();
    this.changed();
  }

  /** Oldest first, for storage. */
  get clearedSeqs(): [string, number][] {
    return [...this.cleared];
  }

  /** Drops events at or below the last Clear of their session, as a backlog refetch repeats them. */
  sinceClear(events: DevEvent[]): DevEvent[] {
    if (!this.cleared.size) return events;
    return events.filter((e) => e.seq > (this.cleared.get(e.session) ?? -Infinity));
  }

  selected(tab: string): Selection | undefined {
    return this.selection.get(tab);
  }

  select(tab: string, key: string | null, from?: Selection['from']): void {
    if (key === null) this.selection.delete(tab);
    else this.selection.set(tab, from ? { key, from } : { key });
    this.notify();
  }

  get size(): number {
    return this.order.length;
  }

  /** Approximate encoded size of the kept events. */
  get bytes(): number {
    return this.total;
  }

  get httpRows(): HttpRow[] {
    this.httpSorted ??= [...this.http.values()].toSorted(byNewest);
    return this.httpSorted;
  }

  get errors(): DevEvent[] {
    this.errorsSnapshot ??= this.errorList.toSorted(byNewest);
    return this.errorsSnapshot;
  }

  get other(): DevEvent[] {
    this.otherSnapshot ??= this.otherList.toReversed();
    return this.otherSnapshot;
  }

  get logs(): DevEvent[] {
    this.logsSnapshot ??= this.logList.toReversed();
    return this.logsSnapshot;
  }

  /** A new Map whenever a run changes. */
  get runs(): ReadonlyMap<string, RunInfo> {
    this.runsSnapshot ??= new Map(this.runMap);
    return this.runsSnapshot;
  }

  get tags(): Map<string, Set<string>> {
    return this.tagMap;
  }

  get all(): readonly DevEvent[] {
    return this.order;
  }

  latestSession(): DevEvent | undefined {
    let best: DevEvent | undefined;
    for (const r of this.runMap.values()) {
      if (r.session && (!best || r.session.ts > best.ts)) best = r.session;
    }
    return best;
  }

  private index(e: DevEvent): void {
    for (const [k, v] of Object.entries(e.tags)) {
      let set = this.tagMap.get(k);
      if (!set) this.tagMap.set(k, (set = new Set()));
      set.add(v);
    }

    const prev = this.runMap.get(e.run);
    const run: RunInfo = prev
      ? { ...prev, first: Math.min(prev.first, e.ts), last: Math.max(prev.last, e.ts) }
      : { run: e.run, conn: e.conn, first: e.ts, last: e.ts };
    if (e.kind === 'app.session' && (!run.session || byNewest(e, run.session) <= 0)) {
      run.session = e;
    }
    if (e.kind === 'app.info' && (!run.info || byNewest(e, run.info) <= 0)) {
      run.info = e;
    }
    this.runMap.set(e.run, run);
    this.runsSnapshot = null;

    if (e.kind === 'app.session' || e.kind === 'app.info') {
      return;
    } else if (e.kind === 'log') {
      this.logList.push(e);
      this.logsSnapshot = null;
    } else if (e.kind.startsWith('http.')) {
      this.indexHttp(e);
    } else if (e.kind === 'error') {
      this.errorList.push(e);
      this.errorsSnapshot = null;
    } else {
      this.otherList.push(e);
      this.otherSnapshot = null;
    }
  }

  private indexHttp(e: DevEvent): void {
    const id = str(e.data.id) ?? '?';
    const key = `${e.session}|${id}`;
    const prev = this.http.get(key);
    const row: HttpRow = prev
      ? { ...prev }
      : {
          key,
          run: e.run,
          session: e.session,
          id,
          method: '',
          url: '',
          host: '',
          ts: e.ts,
          seq: e.seq,
          state: 'pending',
        };
    if (e.kind === 'http.request') {
      row.request = e;
      row.ts = e.ts;
      row.seq = e.seq;
    } else if (e.kind === 'http.response') {
      row.response = e;
    } else if (e.kind === 'http.error') {
      row.error = e;
    } else {
      return;
    }
    const src = row.request ?? row.response ?? row.error;
    row.method = str(src?.data.method) ?? row.method;
    row.url = str(src?.data.url) ?? row.url;
    row.host = hostOf(row.url);
    const end = row.response ?? row.error;
    row.status = num(end?.data.status);
    row.durationMs = num(end?.data.durationMs);
    row.size = end ? bodySize(end.data) : undefined;
    row.state = row.error ? 'error' : row.response ? 'done' : 'pending';
    this.http.set(key, row);
    this.httpSorted = null;
  }

  // Down to 90%, so a steady stream does not reindex on every batch. The newest event always stays.
  private evict(): void {
    const target = this.maxBytes * 0.9;
    const newest = this.order.at(-1);
    const gone = new Set<DevEvent>();
    for (const e of this.order) {
      if (this.total <= target) break;
      if (e === newest || !evictable(e)) continue;
      gone.add(e);
      this.events.delete(e.key);
      this.total -= e.size;
    }
    if (!gone.size) return;
    this.order = this.order.filter((e) => !gone.has(e));
    this.dropped += gone.size;
    this.reindex();
  }

  private reindex(): void {
    this.reset();
    for (const e of this.order) this.index(e);
  }

  private reset(): void {
    this.http.clear();
    this.httpSorted = null;
    this.errorList = [];
    this.errorsSnapshot = null;
    this.otherList = [];
    this.otherSnapshot = null;
    this.logList = [];
    this.logsSnapshot = null;
    this.runMap.clear();
    this.runsSnapshot = null;
    this.tagMap.clear();
  }

  private changed(): void {
    if (this.timer) return;
    // Backlog replays deliver thousands of events at once; render once.
    this.timer = setTimeout(() => {
      this.timer = null;
      this.notify();
    }, 50);
  }

  private notify(): void {
    this.version++;
    for (const fn of this.listeners) fn();
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
};

const encoder = new TextEncoder();
const BYTES = /^<(\d+) bytes>$/;

export function bodySize(data: JsonObject): number {
  const headers = data.headers;
  if (isObject(headers)) {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() !== 'content-length') continue;
      const n = Number(Array.isArray(v) ? v[0] : v);
      if (Number.isFinite(n)) return n;
    }
  }
  const body = data.body;
  if (body === undefined || body === null) return 0;
  if (typeof body === 'string') {
    const m = BYTES.exec(body);
    return m ? Number(m[1]) : encoder.encode(body).length;
  }
  if (isObject(body) && isObject(body[TRUNCATED]) && typeof body[TRUNCATED].size === 'number') {
    return body[TRUNCATED].size;
  }
  return encoder.encode(JSON.stringify(body)).length;
}
