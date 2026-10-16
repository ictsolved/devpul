import { type DevEvent, isObject, type Json, type JsonObject, num, str, stringMap, TRUNCATED } from './events';
import { pretty } from './json';
import type { HttpRow } from './store';

export type MockMode = 'respond' | 'fail' | 'delay' | 'pause';

export const MODES: MockMode[] = ['respond', 'fail', 'delay', 'pause'];

/** A rule as `http.mocks.set` takes it and `http.mocks` returns it. */
export interface MockRule {
  id: string;
  on: boolean;
  /** Upper case; null for any. */
  method: string | null;
  /** The whole URL, `*` for any run of characters. */
  url: string;
  mode: MockMode;
  delayMs: number;
  status: number;
  headers: Record<string, string>;
  body: string;
  message: string;
  request: boolean;
  response: boolean;
}

export const MOCKS = 'http.mocks';
export const SET_MOCKS = 'http.mocks.set';
export const RESUME = 'http.resume';
export const SENT = 'http.sent';
export const REPLAY = 'http.replay';

export function newRule(fields: Partial<MockRule> = {}): MockRule {
  return {
    id: crypto.randomUUID().slice(0, 8),
    on: true,
    method: null,
    url: '',
    mode: 'respond',
    delayMs: 0,
    status: 200,
    headers: {},
    body: '',
    message: 'Mocked network failure',
    request: true,
    response: false,
    ...fields,
  };
}

export function parseRules(data: Json | undefined): MockRule[] {
  const list = isObject(data) && Array.isArray(data.rules) ? data.rules : [];
  return list.flatMap((r) => {
    if (!isObject(r) || typeof r.url !== 'string') return [];
    const mode = MODES.find((m) => m === r.mode) ?? 'respond';
    return [
      newRule({
        id: str(r.id) ?? crypto.randomUUID().slice(0, 8),
        on: r.on !== false,
        method: str(r.method) ?? null,
        url: r.url,
        mode,
        delayMs: num(r.delayMs) ?? 0,
        ...(num(r.status) !== undefined && { status: num(r.status) }),
        headers: stringMap(r.headers),
        body: str(r.body) ?? '',
        ...(str(r.message) !== undefined && { message: str(r.message) }),
        request: r.request !== false,
        response: r.response === true,
      }),
    ];
  });
}

/** The fields `http.mocks.set` reads for the rule's mode. */
export function ruleJson(r: MockRule): JsonObject {
  return {
    id: r.id,
    on: r.on,
    method: r.method,
    url: r.url,
    mode: r.mode,
    delayMs: r.delayMs,
    ...(r.mode === 'respond' && { status: r.status, headers: r.headers, body: r.body }),
    ...(r.mode === 'fail' && { message: r.message }),
    ...(r.mode === 'pause' && { request: r.request, response: r.response }),
  };
}

export function describeRule(r: MockRule): string {
  const delay = r.delayMs && r.mode !== 'pause' ? ` after ${r.delayMs} ms` : '';
  switch (r.mode) {
    case 'respond':
      return `respond ${r.status}${delay}`;
    case 'fail':
      return `fail${delay}: ${r.message}`;
    case 'delay':
      return `delay ${r.delayMs} ms`;
    case 'pause':
      return `pause the ${r.request && r.response ? 'request and response' : r.response ? 'response' : 'request'}`;
  }
}

// Recomputed by the client from the body.
const DROPPED = new Set(['content-length', 'transfer-encoding', 'content-encoding']);

/** A rule answering exactly this request with its captured response. */
export function ruleFromRow(row: HttpRow): MockRule {
  const end = row.response?.data;
  const headers: Record<string, string> = {};
  if (isObject(end?.headers)) {
    for (const [k, v] of Object.entries(end.headers)) {
      if (DROPPED.has(k.toLowerCase())) continue;
      headers[k] = Array.isArray(v) ? v.map(String).join(', ') : String(v);
    }
  }
  return newRule({
    method: row.method || null,
    url: row.url,
    status: row.status ?? 200,
    headers,
    body: bodyText(end?.body),
  });
}

/** A captured body as editable text; cut or binary bodies come back empty. */
export function bodyText(body: Json | undefined): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return /^<\d+ bytes>$|^<stream>$/.test(body) ? '' : body;
  if (isObject(body) && TRUNCATED in body) return '';
  return pretty(body);
}

/** Whether the captured body would not come back whole in a rule. */
export function bodyLost(row: HttpRow): boolean {
  const body = row.response?.data.body;
  return body !== undefined && body !== null && bodyText(body) === '';
}

export const headersText = (headers: Record<string, string>): string =>
  Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

/** `name: value` lines; lines without a colon are skipped. */
export function parseHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf(':');
    if (at <= 0) continue;
    const name = line.slice(0, at).trim();
    if (name) out[name] = line.slice(at + 1).trim();
  }
  return out;
}

/** A request or response to edit: one held at a pause rule, or one `http.sent` returns for a replay. */
export interface Editable {
  /** The app's call id, as it sent it. */
  id: Json;
  stage: 'request' | 'response';
  method: string;
  url: string;
  headers: Record<string, string>;
  body: Json;
  editable: boolean;
  json: boolean;
  status?: number;
  statusMessage?: string;
}

/** A call held at a pause rule, from its `http.paused` event. */
export interface Paused extends Editable {
  event: DevEvent;
  /** App clock. */
  until: number;
}

export function parseEditable(d: JsonObject): Editable {
  const headers: Record<string, string> = {};
  if (isObject(d.headers)) {
    for (const [k, v] of Object.entries(d.headers))
      headers[k] = Array.isArray(v) ? v.map(String).join(', ') : String(v);
  }
  return {
    id: d.id ?? null,
    stage: d.stage === 'response' ? 'response' : 'request',
    method: str(d.method) ?? '',
    url: str(d.url) ?? '',
    headers,
    body: d.body ?? null,
    editable: d.editable === true,
    json: d.json === true,
    status: num(d.status),
    statusMessage: str(d.statusMessage),
  };
}

export function parsePaused(e: DevEvent): Paused {
  return { ...parseEditable(e.data), event: e, until: e.ts + (num(e.data.timeoutMs) ?? 0) };
}

export interface PausedEdit {
  method: string;
  url: string;
  headers: string;
  body: string;
  status: string;
  statusMessage: string;
}

export function editOf(p: Editable): PausedEdit {
  return {
    method: p.method,
    url: p.url,
    headers: headersText(p.headers),
    body: p.editable && typeof p.body === 'string' ? p.body : '',
    status: p.status === undefined ? '' : String(p.status),
    statusMessage: p.statusMessage ?? '',
  };
}

/** `http.resume` or `http.replay` args with only the fields that changed, or an error to show. */
export function resumeArgs(p: Editable, edit: PausedEdit): JsonObject | string {
  const args: JsonObject = { id: p.id };
  const was = editOf(p);
  if (p.stage === 'request') {
    if (edit.method.trim() && edit.method.trim().toUpperCase() !== p.method) {
      args.method = edit.method.trim().toUpperCase();
    }
    if (edit.url.trim() !== p.url) {
      if (!URL.canParse(edit.url.trim())) return 'The URL is not valid.';
      args.url = edit.url.trim();
    }
  } else {
    if (edit.status.trim() !== was.status) {
      const status = Number(edit.status);
      if (!Number.isInteger(status) || status < 100 || status > 599) return 'Status is a number from 100 to 599.';
      args.status = status;
    }
    if (edit.statusMessage !== was.statusMessage) args.statusMessage = edit.statusMessage;
  }
  if (edit.headers !== was.headers) args.headers = parseHeaders(edit.headers);
  if (p.editable && edit.body !== was.body) {
    if (p.json) {
      try {
        JSON.parse(edit.body);
      } catch {
        return 'The body is not valid JSON.';
      }
    }
    args.body = edit.body;
  }
  return args;
}
