import { tagsOf } from './events';
import type { HttpRow } from './store';

export type StatusFilter = '2xx' | '3xx' | '4xx' | '5xx' | 'err' | 'pending';

export interface HttpFilter {
  text: string;
  /** Empty means all. */
  statuses: StatusFilter[];
  methods: string[];
  hosts: string[];
  tags: Record<string, string[]>;
  runs: string[];
}

export const emptyFilter: HttpFilter = {
  text: '',
  statuses: [],
  methods: [],
  hosts: [],
  tags: {},
  runs: [],
};

export interface FieldTerm {
  key: string;
  /** Any of them matches. */
  values: string[];
  negate: boolean;
}

export interface Query {
  include: string[];
  exclude: string[];
  fields: FieldTerm[];
}

/**
 * Words are ANDed, `-word` excludes. `key:a,b` matches a field for the given
 * keys, `-key:a` negates it.
 */
export function parseQuery(text: string, keys: readonly string[] = []): Query {
  const q: Query = { include: [], exclude: [], fields: [] };
  for (const raw of text.split(/\s+/)) {
    if (!raw || raw === '-') continue;
    const negate = raw.startsWith('-');
    const word = negate ? raw.slice(1) : raw;
    const colon = word.indexOf(':');
    const key = colon > 0 ? word.slice(0, colon).toLowerCase() : '';
    const values = word
      .slice(colon + 1)
      .split(',')
      .filter(Boolean);
    if (key && keys.includes(key) && values.length) {
      q.fields.push({ key, values, negate });
    } else {
      (negate ? q.exclude : q.include).push(word.toLowerCase());
    }
  }
  return q;
}

export const isEmptyQuery = (q: Query): boolean =>
  !q.include.length && !q.exclude.length && !q.fields.length;

export function matchesTerms(haystack: string, q: Pick<Query, 'include' | 'exclude'>): boolean {
  return (
    q.include.every((w) => haystack.includes(w)) && !q.exclude.some((w) => haystack.includes(w))
  );
}

export function matchesQuery(
  q: Query,
  haystack: () => string,
  field: (key: string, value: string) => boolean,
): boolean {
  for (const f of q.fields) {
    if (f.values.some((v) => field(f.key, v)) === f.negate) return false;
  }
  if (!q.include.length && !q.exclude.length) return true;
  return matchesTerms(haystack(), q);
}

const COMPARE = /^(>=|<=|>|<|=)?(\d+(?:\.\d+)?)(k|kb|m|mb)?$/i;

/** `>500`, `<=2k`, `404`. Sizes take k and m (1024 based). */
export function compare(value: number | undefined, expr: string): boolean {
  const m = COMPARE.exec(expr);
  if (!m || value === undefined) return false;
  const unit = m[3]?.toLowerCase()[0];
  const n = Number(m[2]) * (unit === 'k' ? 1024 : unit === 'm' ? 1024 * 1024 : 1);
  switch (m[1]) {
    case '>':
      return value > n;
    case '>=':
      return value >= n;
    case '<':
      return value < n;
    case '<=':
      return value <= n;
    default:
      return value === n;
  }
}

/** `tag:env=qa` or `tag:env` for any value. */
export function matchesTag(tags: Record<string, string>, expr: string): boolean {
  const eq = expr.indexOf('=');
  if (eq < 0) return tags[expr] !== undefined;
  return tags[expr.slice(0, eq)]?.toLowerCase() === expr.slice(eq + 1).toLowerCase();
}

export const HTTP_KEYS = ['status', 'method', 'host', 'ms', 'size', 'tag'] as const;

const searchCache = new WeakMap<HttpRow, string>();

/** URL, ids and request/response bodies, lower case. */
export function searchText(row: HttpRow): string {
  let text = searchCache.get(row);
  if (text === undefined) {
    const parts = [`#${row.id}`, row.id, row.method, row.url, String(row.status ?? '')];
    for (const e of [row.request, row.response, row.error]) {
      if (!e) continue;
      const { body, message, errorType } = e.data;
      if (body !== undefined && body !== null) {
        parts.push(typeof body === 'string' ? body : JSON.stringify(body));
      }
      if (typeof message === 'string') parts.push(message);
      if (typeof errorType === 'string') parts.push(errorType);
    }
    text = parts.join('\n').toLowerCase();
    searchCache.set(row, text);
  }
  return text;
}

export function matchesStatus(row: HttpRow, status: string): boolean {
  const code = row.status ?? 0;
  switch (status.toLowerCase()) {
    case 'pending':
      return row.state === 'pending';
    case 'err':
    case 'error':
      return row.state === 'error';
    case '2xx':
      return code >= 200 && code < 300;
    case '3xx':
      return code >= 300 && code < 400;
    case '4xx':
      return code >= 400 && code < 500;
    case '5xx':
      return code >= 500 && code < 600;
    default:
      return compare(row.status, status);
  }
}

export function matchesTags(
  tags: Record<string, string>,
  wanted: Record<string, string[]>,
): boolean {
  for (const [key, values] of Object.entries(wanted)) {
    if (!values.length) continue;
    const v = tags[key];
    if (v === undefined || !values.includes(v)) return false;
  }
  return true;
}

const rowTags = (row: HttpRow): Record<string, string> => {
  const e = row.request ?? row.response ?? row.error;
  return e ? tagsOf(e) : {};
};

function httpField(row: HttpRow, key: string, value: string): boolean {
  switch (key) {
    case 'status':
      return matchesStatus(row, value);
    case 'method':
      return row.method.toLowerCase() === value.toLowerCase();
    case 'host':
      return row.host.toLowerCase().includes(value.toLowerCase());
    case 'ms':
      return compare(row.durationMs, value);
    case 'size':
      return compare(row.size, value);
    case 'tag':
      return matchesTag(rowTags(row), value);
    default:
      return false;
  }
}

export function filterRows(rows: readonly HttpRow[], f: HttpFilter): HttpRow[] {
  const q = parseQuery(f.text, HTTP_KEYS);
  const anyTags = Object.values(f.tags).some((v) => v.length > 0);
  return rows.filter((row) => {
    if (f.statuses.length && !f.statuses.some((s) => matchesStatus(row, s))) return false;
    if (f.methods.length && !f.methods.includes(row.method)) return false;
    if (f.hosts.length && !f.hosts.includes(row.host)) return false;
    if (f.runs.length && !f.runs.includes(row.run)) return false;
    if (anyTags && !matchesTags(rowTags(row), f.tags)) return false;
    return matchesQuery(
      q,
      () => searchText(row),
      (key, value) => httpField(row, key, value),
    );
  });
}

export type SortKey = 'id' | 'time' | 'method' | 'status' | 'ms' | 'size' | 'url';

export interface Sort {
  key: SortKey;
  desc: boolean;
}

export const defaultSort: Sort = { key: 'time', desc: true };

const collator = new Intl.Collator(undefined, { numeric: true });

function sortValue(row: HttpRow, key: SortKey): string | number | undefined {
  switch (key) {
    case 'id':
      return row.id;
    case 'time':
      return row.ts;
    case 'method':
      return row.method;
    case 'status':
      return row.status;
    case 'ms':
      return row.durationMs;
    case 'size':
      return row.size;
    case 'url':
      return row.url;
  }
}

/** Missing values sort last either way; ties keep newest first. */
export function sortRows(rows: readonly HttpRow[], sort: Sort): HttpRow[] {
  const dir = sort.desc ? -1 : 1;
  return rows.toSorted((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    if (x === undefined || y === undefined) {
      if (x !== y) return x === undefined ? 1 : -1;
    } else if (x !== y) {
      const c =
        typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
      if (c) return c * dir;
    }
    return b.ts - a.ts || b.seq - a.seq;
  });
}
