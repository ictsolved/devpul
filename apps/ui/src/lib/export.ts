import { type DevEvent, isObject, type Json, type JsonObject, str, TRUNCATED } from './events';
import { headerValue } from './fetch';
import type { HttpRow } from './store';

interface NameValue {
  name: string;
  value: string;
}

const harHeaders = (headers: Json | undefined): NameValue[] =>
  isObject(headers)
    ? Object.entries(headers).flatMap(([name, v]) =>
        v === null ? [] : Array.isArray(v) ? v.map((x) => ({ name, value: headerValue(x) })) : [{ name, value: headerValue(v) }],
      )
    : [];

const mimeOf = (headers: Json | undefined): string =>
  harHeaders(headers).find((h) => h.name.toLowerCase() === 'content-type')?.value ?? '';

function bodyText(body: Json | undefined): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === 'string') return body;
  if (isObject(body) && isObject(body[TRUNCATED])) return str(body[TRUNCATED].preview) ?? '';
  return JSON.stringify(body);
}

function queryString(url: string): NameValue[] {
  try {
    return [...new URL(url).searchParams].map(([name, value]) => ({ name, value }));
  } catch {
    return [];
  }
}

function entry(row: HttpRow) {
  const req: JsonObject = row.request?.data ?? {};
  const end: JsonObject = (row.response ?? row.error)?.data ?? {};
  const reqBody = bodyText(req.body);
  const resBody = bodyText(end.body);
  const time = row.durationMs ?? 0;
  return {
    startedDateTime: new Date(row.ts).toISOString(),
    time,
    request: {
      method: row.method,
      url: row.url,
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: harHeaders(req.headers),
      queryString: queryString(row.url),
      headersSize: -1,
      bodySize: reqBody?.length ?? 0,
      ...(reqBody !== undefined && { postData: { mimeType: mimeOf(req.headers), text: reqBody } }),
    },
    response: {
      status: row.status ?? 0,
      statusText: str(end.statusMessage) ?? '',
      httpVersion: 'HTTP/1.1',
      cookies: [],
      headers: harHeaders(end.headers),
      content: { size: row.size ?? 0, mimeType: mimeOf(end.headers), ...(resBody !== undefined && { text: resBody }) },
      redirectURL: str(end.finalUrl) ?? '',
      headersSize: -1,
      bodySize: row.size ?? -1,
    },
    cache: {},
    timings: { send: 0, wait: time, receive: 0 },
    ...(row.error && {
      _error: [str(row.error.data.errorType), str(row.error.data.message)].filter(Boolean).join(': '),
    }),
  };
}

/** HAR 1.2, oldest first. Bodies cut by the app keep only their preview. */
export function toHar(rows: readonly HttpRow[], version: string): string {
  const entries = rows.toSorted((a, b) => a.ts - b.ts || a.seq - b.seq).map(entry);
  return JSON.stringify({ log: { version: '1.2', creator: { name: 'DevPul', version }, entries } }, null, 2);
}

const KIND = 'devpul.session';

export function toSession(events: readonly DevEvent[]): string {
  return JSON.stringify({ format: KIND, version: 1, exported: Date.now(), events });
}

/** Throws on anything that is not a DevPul session file. */
export function fromSession(text: string, nextN: () => number): DevEvent[] {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || parsed.format !== KIND || !Array.isArray(parsed.events)) {
    throw new Error('Not a DevPul session file.');
  }
  const out: DevEvent[] = [];
  for (const e of parsed.events) {
    if (!isObject(e) || !isObject(e.data)) continue;
    const { key, kind, session, run, conn, ts } = e;
    if (
      typeof key !== 'string' ||
      typeof kind !== 'string' ||
      typeof session !== 'string' ||
      typeof run !== 'string' ||
      typeof conn !== 'string' ||
      typeof ts !== 'number'
    ) {
      continue;
    }
    out.push({
      key,
      kind,
      data: e.data,
      session,
      seq: typeof e.seq === 'number' ? e.seq : null,
      run,
      isolate: str(e.isolate) ?? '',
      conn,
      ts,
      n: nextN(),
      size: typeof e.size === 'number' ? e.size : JSON.stringify(e.data).length,
    });
  }
  return out;
}

export function download(name: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
