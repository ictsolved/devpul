import { type DevEvent, type IsolateRef, isObject, type Json, type JsonObject, num, str, TRUNCATED } from './events';
import { dataUrl, dataUrlLength, imageType } from './image';

/** `data.source` of a request read from dart:io's HTTP profile, with no adapter in the app. */
export const DART_IO = 'dart:io';
export const GET_PROFILE = 'ext.dart.io.getHttpProfile';
const GET_REQUEST = 'ext.dart.io.getHttpProfileRequest';
const LOGGING = 'ext.dart.io.httpEnableTimelineLogging';
export const POLL_MS = 1000;
// The adapters' default `maxValueLength`.
const MAX_BODY = 1024 * 1024;
const TEXT = /json|text|xml|javascript|x-www-form-urlencoded|graphql/i;

type Call = (method: string, params: Record<string, unknown>) => Promise<unknown>;

/** What the UI already holds, so the profile adds no request twice. */
export interface ProfileLookup {
  /** The store keeps this event, or a Clear went past it. */
  seen(session: string, seq: number): boolean;
  /** An adapter posted this request shortly before dart:io started it at `ms`. */
  sentByAdapter(isolateId: string, method: string, url: string, ms: number): boolean;
}

export interface ProfileIds {
  conn: string;
  run: string;
  isolate: string;
  isolateId: string;
  n: number;
}

export const profileSession = (isolateId: string): string => `profile:${isolateId}`;

const obj = (v: unknown): JsonObject | undefined => (isObject(v) ? v : undefined);

function href(url: string, base?: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

const locations = (ref: JsonObject): string[] => {
  const list = obj(ref.response)?.redirects;
  return Array.isArray(list)
    ? list.flatMap((r) => (isObject(r) && typeof r.location === 'string' ? [r.location] : []))
    : [];
};

/** Where the redirects ended, if the client followed any. */
function finalUrl(ref: JsonObject): string | undefined {
  const url = str(ref.uri) ?? '';
  const last = locations(ref).reduce((base, loc) => href(loc, base), url);
  return last === href(url) ? undefined : last;
}

/**
 * dart:io records each redirect hop as a request of its own that gets the
 * first request's final response. The first request is the one shown.
 */
export function isHop(ref: JsonObject): boolean {
  const url = href(str(ref.uri) ?? '');
  return locations(ref).some((loc) => href(loc, url) === url);
}

/** When the request ended: its response's end, or the error that cut it. */
export function endTime(ref: JsonObject): number | undefined {
  const res = obj(ref.response);
  if (res) return num(res.endTime);
  return obj(ref.request)?.error === undefined ? undefined : num(ref.endTime);
}

// Until its response starts, a redirect hop looks like any other request.
const ready = (ref: JsonObject): boolean => obj(ref.response) !== undefined || endTime(ref) !== undefined;

/** Single values as strings, repeated ones as lists, as the adapters send them. */
function headers(v: unknown): JsonObject {
  const out: JsonObject = {};
  if (!isObject(v)) return out;
  for (const [k, x] of Object.entries(v)) {
    if (Array.isArray(x)) out[k] = x.length === 1 ? (x[0] ?? null) : x;
    else if (x !== null) out[k] = x;
  }
  return out;
}

function header(v: unknown, name: string): string | undefined {
  const value = headers(v)[name];
  return Array.isArray(value) ? str(value[0]) : str(value);
}

function params(url: string): JsonObject {
  const out: JsonObject = {};
  let search: URLSearchParams;
  try {
    search = new URL(url).searchParams;
  } catch {
    return out;
  }
  for (const key of new Set(search.keys())) {
    const all = search.getAll(key);
    out[key] = all.length === 1 ? (all[0] ?? '') : all;
  }
  return out;
}

const decoder = new TextDecoder('utf-8', { fatal: true });

const binaryImage = (type: string | undefined) => (type && !TEXT.test(type) ? imageType(type) : undefined);
// The adapters send an image whole within their `maxValueLength`.
const fits = (image: string, bytes: number) => dataUrlLength(image, bytes) + 2 <= MAX_BODY;

/**
 * Profile body bytes as the adapters send a body: JSON parsed, text as is,
 * an image as a `data:` URL, anything else as its size.
 */
export function profileBody(bytes: unknown, type?: string): Json {
  if (!Array.isArray(bytes) || !bytes.length) return null;
  const image = binaryImage(type);
  if (image) {
    return fits(image, bytes.length) ? dataUrl(image, Uint8Array.from(bytes as number[])) : `<${bytes.length} bytes>`;
  }
  let text: string;
  try {
    text = decoder.decode(Uint8Array.from(bytes as number[]));
  } catch {
    return `<${bytes.length} bytes>`;
  }
  if (text.length > MAX_BODY) return { [TRUNCATED]: { size: bytes.length, preview: text.slice(0, MAX_BODY) } };
  const start = text.trimStart();
  if (start.startsWith('{') || start.startsWith('[')) {
    try {
      return JSON.parse(text) as Json;
    } catch {
      // Sent as text.
    }
  }
  return text;
}

// `SocketException: Connection refused (...)` as the adapters' `errorType` and `message`.
function errorParts(text: string): { errorType: string; message: string } {
  const m = /^([A-Za-z_$][\w$]*): ([\s\S]*)$/.exec(text);
  return m ? { errorType: m[1]!, message: m[2]! } : { errorType: 'error', message: text };
}

function event(kind: string, seq: number, data: JsonObject, ids: ProfileIds): DevEvent {
  const session = profileSession(ids.isolateId);
  return {
    key: `${session}|${seq}`,
    kind,
    data,
    tags: {},
    session,
    seq,
    run: ids.run,
    isolate: ids.isolate,
    isolateId: ids.isolateId,
    conn: ids.conn,
    ts: Math.floor(seq / 1000),
    n: ids.n,
    size: JSON.stringify(data).length,
  };
}

const noBody = (method: string) => method === 'GET' || method === 'HEAD';

/** The `http.request` of a profile entry, keyed by its start in microseconds. */
export function requestEvent(ref: JsonObject, full: JsonObject | undefined, ids: ProfileIds): DevEvent {
  const method = str(ref.method) ?? '';
  const url = str(ref.uri) ?? '';
  return event(
    'http.request',
    num(ref.startTime) ?? 0,
    {
      id: str(ref.id) ?? '?',
      method,
      url,
      params: params(url),
      headers: headers(obj(ref.request)?.headers),
      body: noBody(method) ? null : profileBody(full?.requestBody, header(obj(ref.request)?.headers, 'content-type')),
      source: DART_IO,
    },
    ids,
  );
}

/** The `http.response` or `http.error` of an entry that ended, keyed by its end. */
export function endEvent(ref: JsonObject, body: Json, ids: ProfileIds): DevEvent | null {
  const end = endTime(ref);
  if (end === undefined) return null;
  const res = obj(ref.response);
  const data: JsonObject = {
    id: str(ref.id) ?? '?',
    method: str(ref.method) ?? '',
    url: str(ref.uri) ?? '',
    status: num(res?.statusCode) ?? null,
    durationMs: Math.round((end - (num(ref.startTime) ?? end)) / 1000),
    headers: headers(res?.headers),
    body,
    source: DART_IO,
  };
  const error = str(res?.error) ?? str(obj(ref.request)?.error);
  if (error !== undefined) return event('http.error', end, { ...data, ...errorParts(error) }, ids);
  const landed = finalUrl(ref);
  return event(
    'http.response',
    end,
    { ...data, statusMessage: str(res?.reasonPhrase) ?? null, ...(landed && { finalUrl: landed }) },
    ids,
  );
}

interface Tracked {
  ref: IsolateRef;
  /** dart:io's logging before this UI turned it on. */
  prior?: boolean;
  since?: number;
  entries: Map<string, JsonObject>;
  requested: Set<string>;
  done: Set<string>;
}

/**
 * Turns dart:io's HTTP logging on in each isolate that offers the profile,
 * polls `getHttpProfile` and adds what it records as HTTP events. Off sets
 * the logging back to what it was.
 */
export class HttpProfiler {
  private isolates = new Map<string, Tracked>();
  private on = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private busy = false;

  constructor(
    private readonly call: Call,
    private readonly emit: (events: DevEvent[]) => void,
    private readonly context: { conn: string; run: (iso: IsolateRef) => string; n: () => number },
    private readonly lookup?: ProfileLookup,
  ) {}

  /** Some isolate offers the profile; web apps have no dart:io. */
  get offered(): boolean {
    return this.isolates.size > 0;
  }

  add(ref: IsolateRef): void {
    if (!ref.id || this.isolates.has(ref.id)) return;
    this.isolates.set(ref.id, { ref, entries: new Map(), requested: new Set(), done: new Set() });
    this.schedule();
  }

  remove(isolateId: string): void {
    this.isolates.delete(isolateId);
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on) {
      this.schedule();
      return;
    }
    this.stopTimer();
    for (const iso of this.isolates.values()) this.restore(iso);
  }

  /** Sets the logging back and forgets the isolates, staying on for the next connect. */
  release(): void {
    for (const iso of this.isolates.values()) this.restore(iso);
    this.reset();
  }

  /** The connection closed, so there is nothing to set back. */
  reset(): void {
    this.stopTimer();
    this.isolates.clear();
  }

  private restore(iso: Tracked): void {
    if (iso.prior === false && iso.ref.id) {
      this.call(LOGGING, { isolateId: iso.ref.id, enabled: 'false' }).catch(() => {});
    }
    iso.prior = undefined;
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (!this.on || !this.isolates.size || this.timer || this.busy) return;
    this.timer = setTimeout(() => void this.tick(), POLL_MS);
  }

  private async tick(): Promise<void> {
    this.timer = null;
    this.busy = true;
    for (const iso of this.isolates.values()) {
      if (!this.on || this.isolates.get(iso.ref.id ?? '') !== iso) continue;
      try {
        await this.poll(iso);
      } catch {
        // Paused, gone or closed; the next tick tries again.
      }
    }
    this.busy = false;
    this.schedule();
  }

  private async poll(iso: Tracked): Promise<void> {
    const isolateId = iso.ref.id!;
    if (iso.prior === undefined) {
      const state = await this.call(LOGGING, { isolateId });
      const prior = isObject(state) && state.enabled === true;
      if (!prior) await this.call(LOGGING, { isolateId, enabled: 'true' });
      iso.prior = prior;
    }
    const result = await this.call(GET_PROFILE, {
      isolateId,
      ...(iso.since !== undefined && { updatedSince: String(iso.since) }),
    });
    if (!isObject(result) || !Array.isArray(result.requests)) return;
    const refs = result.requests.filter(isObject);
    for (const ref of refs) {
      const id = str(ref.id);
      if (id) iso.entries.set(id, ref);
    }
    const out: DevEvent[] = [];
    for (const ref of refs) await this.take(iso, ref, out);
    if (out.length) this.emit(out);
    iso.since = num(result.timestamp) ?? iso.since;
  }

  private async take(iso: Tracked, ref: JsonObject, out: DevEvent[]): Promise<void> {
    const id = str(ref.id);
    if (!id || iso.done.has(id)) return;
    if (isHop(ref)) {
      iso.done.add(id);
      return;
    }
    if (!ready(ref)) return;
    const isolateId = iso.ref.id!;
    const method = str(ref.method) ?? '';
    const start = num(ref.startTime) ?? 0;
    const end = endTime(ref);
    if (
      !iso.requested.has(id) &&
      this.lookup?.sentByAdapter(isolateId, method, str(ref.uri) ?? '', Math.floor(start / 1000))
    ) {
      iso.done.add(id);
      return;
    }
    const session = profileSession(isolateId);
    const seen = (seq: number) => this.lookup?.seen(session, seq) === true;
    const wantRequest = !iso.requested.has(id) && !seen(start);
    const wantEnd = end !== undefined && !seen(end);
    iso.requested.add(id);
    if (end !== undefined) iso.done.add(id);
    if (!wantRequest && !wantEnd) return;

    const res = obj(ref.response);
    // A redirected request's body arrives on its last hop.
    const source = this.lastHop(iso, ref) ?? ref;
    const length = Number(header(res?.headers, 'content-length') ?? NaN);
    const type = header(res?.headers, 'content-type');
    let body: Json = null;
    if (wantEnd && res && type && !TEXT.test(type) && Number.isFinite(length)) {
      const image = binaryImage(type);
      if (!image || !fits(image, length)) body = `<${length} bytes>`;
    }
    const readResponse = wantEnd && res !== undefined && body === null;
    const read = async (entry: JsonObject) => {
      try {
        return obj(await this.call(GET_REQUEST, { isolateId, id: entry.id }));
      } catch {
        return undefined;
      }
    };
    const full = (wantRequest && !noBody(method)) || (readResponse && source === ref) ? await read(ref) : undefined;
    if (readResponse) body = profileBody((source === ref ? full : await read(source))?.responseBody, type);

    const ids = () => ({
      conn: this.context.conn,
      run: this.context.run(iso.ref),
      isolate: iso.ref.name ?? '',
      isolateId,
      n: this.context.n(),
    });
    if (wantRequest) out.push(requestEvent(ref, full, ids()));
    const ended = wantEnd ? endEvent(ref, body, ids()) : null;
    if (ended) out.push(ended);
  }

  private lastHop(iso: Tracked, ref: JsonObject): JsonObject | undefined {
    const target = finalUrl(ref);
    if (target === undefined) return undefined;
    const from = num(ref.startTime) ?? 0;
    const until = num(obj(ref.response)?.startTime) ?? Infinity;
    let best: JsonObject | undefined;
    for (const e of iso.entries.values()) {
      const start = num(e.startTime) ?? 0;
      if (href(str(e.uri) ?? '') !== target || start < from || start > until) continue;
      if (!best || start > (num(best.startTime) ?? 0)) best = e;
    }
    return best;
  }
}
