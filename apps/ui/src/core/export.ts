import { type DevEvent, isObject, type Json, type JsonObject, num, str, stringMap, TRUNCATED } from './events';
import { headerValue } from './fetch';
import type { HttpRow } from './store';

interface NameValue {
  name: string;
  value: string;
}

const harHeaders = (headers: Json | undefined): NameValue[] =>
  isObject(headers)
    ? Object.entries(headers).flatMap(([name, v]) =>
        v === null
          ? []
          : Array.isArray(v)
            ? v.map((x) => ({ name, value: headerValue(x) }))
            : [{ name, value: headerValue(v) }],
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

const TYPE = 'devpul.session';
export const SESSION_FORMAT = 1;

/** A bug report: the app's window and device when the session file was saved. */
export interface Report {
  ts: number;
  /** The run the screenshot and device come from. */
  run: string;
  screenshot?: Screenshot;
  /** `flutter.device`'s answer. */
  device?: JsonObject;
}

export interface Screenshot {
  /** A PNG data URL. */
  image: string;
  width: number;
  height: number;
}

export function parseScreenshot(v: unknown): Screenshot | undefined {
  if (!isObject(v) || !str(v.image)?.startsWith('data:image/')) return undefined;
  const width = num(v.width);
  const height = num(v.height);
  return width && height ? { image: v.image as string, width, height } : undefined;
}

function parseReport(v: unknown): Report | undefined {
  if (!isObject(v)) return undefined;
  const ts = num(v.ts);
  const run = str(v.run);
  if (ts === undefined || run === undefined) return undefined;
  const screenshot = parseScreenshot(v.screenshot);
  return { ts, run, ...(screenshot && { screenshot }), ...(isObject(v.device) && { device: v.device }) };
}

export function toSession(events: readonly DevEvent[], report?: Report): string {
  return JSON.stringify({
    type: TYPE,
    format: SESSION_FORMAT,
    exported: Date.now(),
    ...(report && { report }),
    events: events.map((e) => ({
      kind: e.kind,
      run: e.run,
      isolate: e.isolate,
      session: e.session,
      seq: e.seq,
      ts: e.ts,
      ...(Object.keys(e.tags).length > 0 && { tags: e.tags }),
      data: e.data,
    })),
  });
}

/** Throws on anything that is not a DevPul session file this UI reads. */
export function fromSession(text: string, conn: string, nextN: () => number): { events: DevEvent[]; report?: Report } {
  const parsed: unknown = JSON.parse(text);
  if (!isObject(parsed) || parsed.type !== TYPE || !Array.isArray(parsed.events)) {
    throw new Error('Not a DevPul session file.');
  }
  if (parsed.format !== SESSION_FORMAT) {
    throw new Error(`Session file format ${String(parsed.format)} is not supported here; this UI reads format 1.`);
  }
  const out: DevEvent[] = [];
  for (const e of parsed.events) {
    if (!isObject(e) || !isObject(e.data)) continue;
    const { kind, run, session, seq, ts } = e;
    if (
      typeof kind !== 'string' ||
      typeof run !== 'string' ||
      typeof session !== 'string' ||
      typeof seq !== 'number' ||
      typeof ts !== 'number'
    ) {
      continue;
    }
    const tags = stringMap(e.tags);
    out.push({
      key: `${session}|${seq}`,
      kind,
      data: e.data,
      tags,
      session,
      seq,
      run,
      isolate: str(e.isolate) ?? '',
      conn,
      ts,
      n: nextN(),
      size: JSON.stringify(e).length,
    });
  }
  const report = parseReport(parsed.report);
  return { events: out, ...(report && { report }) };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** `flutter.device`'s answer as labeled rows, keys it does not know last. */
export function deviceRows(device: JsonObject): [string, string][] {
  const {
    platform,
    os,
    mode,
    flutter,
    dart,
    locale,
    width,
    height,
    pixelRatio,
    textScale,
    brightness,
    accessibility,
    ...rest
  } = device;
  const rows: [string, string | undefined][] = [
    ['Platform', str(platform)],
    ['OS', str(os)],
    ['Build', str(mode)],
    ['Flutter', str(flutter) && `${str(flutter)}${str(dart) ? `, Dart ${str(dart)}` : ''}`],
    ['Locale', str(locale)],
    [
      'Window',
      num(width) !== undefined && num(height) !== undefined
        ? `${round(num(width)!)} x ${round(num(height)!)}${num(pixelRatio) ? ` at ${round(num(pixelRatio)!)}x` : ''}`
        : undefined,
    ],
    ['Text scale', num(textScale) === undefined ? undefined : String(round(num(textScale)!))],
    ['Brightness', str(brightness)],
    ['Accessibility', Array.isArray(accessibility) && accessibility.length ? accessibility.join(', ') : undefined],
    ...Object.entries(rest).map(([k, v]): [string, string] => [k, typeof v === 'string' ? v : JSON.stringify(v)]),
  ];
  return rows.filter((r): r is [string, string] => r[1] !== undefined);
}
