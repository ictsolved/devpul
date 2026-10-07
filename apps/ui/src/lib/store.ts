import { type DevEvent, isObject, type JsonObject, num, str, tagsOf, TRUNCATED } from './events';

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
  /** Latest `app.actions` event of the run. */
  actions?: DevEvent;
}

const byNewest = (a: { ts: number; seq: number }, b: { ts: number; seq: number }) =>
  b.ts - a.ts || b.seq - a.seq;

export class Store {
  maxEvents: number;
  version = 0;

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
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(maxEvents = 20000) {
    this.maxEvents = maxEvents;
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
      this.index(e);
      added.push(e);
    }
    if (!added.length) return added;
    if (this.order.length > this.maxEvents) this.evict();
    this.changed();
    return added;
  }

  /** Drops matching events; returns their keys. */
  remove(pred: (e: DevEvent) => boolean): string[] {
    const gone = this.order.filter(pred);
    if (!gone.length) return [];
    this.order = this.order.filter((e) => !pred(e));
    for (const e of gone) this.events.delete(e.key);
    this.reindex();
    this.changed();
    return gone.map((e) => e.key);
  }

  clear(): void {
    this.events.clear();
    this.order = [];
    this.reset();
    this.changed();
  }

  get size(): number {
    return this.order.length;
  }

  get httpRows(): HttpRow[] {
    this.httpSorted ??= [...this.http.values()].toSorted(byNewest);
    return this.httpSorted;
  }

  get errors(): DevEvent[] {
    this.errorsSnapshot ??= this.errorList.toSorted(eventNewest);
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
    for (const [k, v] of Object.entries(tagsOf(e))) {
      let set = this.tagMap.get(k);
      if (!set) this.tagMap.set(k, (set = new Set()));
      set.add(v);
    }

    const prev = this.runMap.get(e.run);
    const run: RunInfo = prev
      ? { ...prev, first: Math.min(prev.first, e.ts), last: Math.max(prev.last, e.ts) }
      : { run: e.run, conn: e.conn, first: e.ts, last: e.ts };
    if (e.kind === 'app.session' && (!run.session || e.ts >= run.session.ts)) {
      run.session = e;
    }
    if (e.kind === 'app.actions' && (!run.actions || e.ts >= run.actions.ts)) {
      run.actions = e;
    }
    this.runMap.set(e.run, run);
    this.runsSnapshot = null;

    if (e.kind === 'app.session' || e.kind === 'app.actions') {
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
          seq: e.seq ?? 0,
          state: 'pending',
        };
    if (e.kind === 'http.request') {
      row.request = e;
      row.ts = e.ts;
      row.seq = e.seq ?? row.seq;
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

  private evict(): void {
    const keep = Math.floor(this.maxEvents * 0.9);
    const dropped = this.order.slice(0, this.order.length - keep);
    this.order = this.order.slice(this.order.length - keep);
    for (const e of dropped) this.events.delete(e.key);
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
      this.version++;
      for (const fn of this.listeners) fn();
    }, 50);
  }
}

const eventNewest = (a: DevEvent, b: DevEvent) =>
  b.ts - a.ts || (b.seq ?? 0) - (a.seq ?? 0);

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
