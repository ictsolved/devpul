import { isObject, type Json } from './events';
import { formatDateTime, pretty } from './json';
import { decodeJwt, TIME_CLAIMS } from './jwt';

export type DecodeAs = 'base64' | 'url' | 'jwt' | 'json' | 'time';

export const DECODE_LABELS: Record<DecodeAs, string> = {
  base64: 'Base64',
  url: 'URL',
  jwt: 'JWT',
  json: 'JSON',
  time: 'Timestamp',
};

/** What a value shows without a click: a chip that expands it, or a time. */
export type Hint = { as: 'jwt' | 'json' } | { time: number };

export interface HintContext {
  headers?: boolean;
  /** When the headers were sent or received, for resets given in seconds from then. */
  at?: number;
}

export type Decoded = { value: Json } | { text: string } | { error: string };

const HTTP_DATES = new Set(['date', 'expires', 'last-modified', 'if-modified-since', 'retry-after']);
const RESETS = new Set(['x-ratelimit-reset', 'x-rate-limit-reset', 'ratelimit-reset', 'retry-after']);
const TIME_KEY = /_at$|[a-z0-9]At$/;
const NUMBER = /^\d+(\.\d+)?$/;
const BASE64 = /^[A-Za-z0-9+/_-]*={0,2}$/;

/** Epoch seconds or milliseconds between 2001 and 2286, told apart by size. */
function epoch(n: number): number | undefined {
  if (n >= 1e9 && n < 1e10) return n * 1000;
  if (n >= 1e12 && n < 1e13) return n;
  return undefined;
}

function jsonText(s: string): Json | undefined {
  const t = s.trim();
  const first = t[0];
  const last = t[t.length - 1];
  if (!((first === '{' && last === '}') || (first === '[' && last === ']'))) return undefined;
  try {
    const value = JSON.parse(t) as Json;
    return (isObject(value) || Array.isArray(value)) && Object.keys(value).length ? value : undefined;
  } catch {
    return undefined;
  }
}

export function hint(key: string | undefined, value: Json, context: HintContext = {}): Hint | undefined {
  const name = key?.toLowerCase();
  if (context.headers && name && typeof value === 'string') {
    if (RESETS.has(name) && NUMBER.test(value.trim())) {
      const n = Number(value);
      const time = epoch(n) ?? (context.at !== undefined && n < 1e9 ? context.at + n * 1000 : undefined);
      if (time !== undefined) return { time };
    }
    if (HTTP_DATES.has(name)) {
      // Date.parse reads "-1" as a year; HTTP dates name the month.
      const time = /[a-z]{3}/i.test(value) ? Date.parse(value) : NaN;
      if (Number.isFinite(time)) return { time };
    }
  }
  if (typeof value === 'number' && key && !context.headers && (TIME_CLAIMS.has(key) || TIME_KEY.test(key))) {
    const time = epoch(value);
    if (time !== undefined) return { time };
  }
  if (typeof value !== 'string') return undefined;
  if (decodeJwt(value)) return { as: 'jwt' };
  if (jsonText(value)) return { as: 'json' };
  return undefined;
}

/** The decoders the menu offers for a value. */
export function decoders(value: Json): DecodeAs[] {
  if (typeof value === 'string') return ['base64', 'url', 'jwt', 'json', 'time'];
  if (typeof value === 'number') return ['time'];
  return [];
}

function base64(s: string): Decoded {
  const t = s.replace(/\s+/g, '');
  if (!t || !BASE64.test(t) || t.length % 4 === 1) return { error: 'Not Base64.' };
  const b64 = t.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')), (c) => c.charCodeAt(0));
  } catch {
    return { error: 'Not Base64.' };
  }
  try {
    return { value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { error: `Not UTF-8 text: ${bytes.length} bytes.` };
  }
}

function toTime(value: Json): Decoded {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (typeof raw === 'number' || (typeof raw === 'string' && NUMBER.test(raw))) {
    const n = Number(raw);
    const seconds = Math.abs(n) < 1e11;
    const ms = seconds ? n * 1000 : n;
    if (!Number.isFinite(new Date(ms).getTime())) return { error: 'Not a time.' };
    return { text: `${formatDateTime(ms)} (Unix ${seconds ? 'seconds' : 'milliseconds'})` };
  }
  const ms = typeof raw === 'string' ? Date.parse(raw) : NaN;
  return Number.isFinite(ms) ? { text: formatDateTime(ms) } : { error: 'Not a time.' };
}

export function decodeAs(as: DecodeAs, value: Json): Decoded {
  if (as === 'time') return toTime(value);
  if (typeof value !== 'string') return { error: 'Not a string.' };
  switch (as) {
    case 'base64':
      return base64(value);
    case 'url':
      try {
        return { value: decodeURIComponent(value) };
      } catch {
        return { error: 'Not URL encoded.' };
      }
    case 'jwt': {
      const jwt = decodeJwt(value.trim().replace(/^bearer\s+/i, ''));
      return jwt ? { value: { claims: jwt.claims, header: jwt.header } } : { error: 'Not a signed JWT.' };
    }
    case 'json': {
      try {
        return { value: JSON.parse(value) as Json };
      } catch {
        return { error: 'Not JSON.' };
      }
    }
  }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** A JavaScript-style path: `user.tokens[0]`, `headers["content-type"]`. */
export function childPath(parent: string, key: string, index: boolean): string {
  const step = index ? `[${key}]` : IDENTIFIER.test(key) ? key : `[${JSON.stringify(key)}]`;
  return !parent || step.startsWith('[') ? parent + step : `${parent}.${step}`;
}

export const copyValue = (value: unknown): string => (typeof value === 'string' ? value : pretty(value));
