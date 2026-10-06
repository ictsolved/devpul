import { tagsOf } from './events';
import type { HttpRow } from './store';

export type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'err' | 'pending';

export interface HttpFilter {
  text: string;
  status: StatusFilter;
  methods: string[];
  tags: Record<string, string[]>;
  runs: string[];
}

export const emptyFilter: HttpFilter = {
  text: '',
  status: 'all',
  methods: [],
  tags: {},
  runs: [],
};

export interface Terms {
  include: string[];
  exclude: string[];
}

/** Words are ANDed, `-word` excludes. */
export function parseTerms(text: string): Terms {
  const include: string[] = [];
  const exclude: string[] = [];
  for (const word of text.toLowerCase().split(/\s+/)) {
    if (!word || word === '-') continue;
    if (word.startsWith('-')) exclude.push(word.slice(1));
    else include.push(word);
  }
  return { include, exclude };
}

export function matchesTerms(haystack: string, terms: Terms): boolean {
  return (
    terms.include.every((w) => haystack.includes(w)) &&
    !terms.exclude.some((w) => haystack.includes(w))
  );
}

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

export function matchesStatus(row: HttpRow, status: StatusFilter): boolean {
  const code = row.status ?? 0;
  switch (status) {
    case 'all':
      return true;
    case 'pending':
      return row.state === 'pending';
    case 'err':
      return row.state === 'error';
    case '2xx':
      return code >= 200 && code < 300;
    case '3xx':
      return code >= 300 && code < 400;
    case '4xx':
      return code >= 400 && code < 500;
    case '5xx':
      return code >= 500 && code < 600;
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

export function filterRows(rows: readonly HttpRow[], f: HttpFilter): HttpRow[] {
  const terms = parseTerms(f.text);
  const anyTerms = terms.include.length > 0 || terms.exclude.length > 0;
  const anyTags = Object.values(f.tags).some((v) => v.length > 0);
  return rows.filter((row) => {
    if (!matchesStatus(row, f.status)) return false;
    if (f.methods.length && !f.methods.includes(row.method)) return false;
    if (f.runs.length && !f.runs.includes(row.run)) return false;
    if (anyTags) {
      const e = row.request ?? row.response ?? row.error;
      if (!e || !matchesTags(tagsOf(e), f.tags)) return false;
    }
    return !anyTerms || matchesTerms(searchText(row), terms);
  });
}
