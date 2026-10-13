export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export interface IsolateRef {
  id?: string;
  name?: string;
  isolateGroupId?: string;
}

export interface VmExtensionEvent {
  extensionKind?: string;
  extensionData?: JsonObject;
  isolate?: IsolateRef;
  isolateGroup?: { id?: string };
  timestamp?: number;
}

export interface DevEvent {
  key: string;
  kind: string;
  /** The envelope's `data`: the fields the app sent. */
  data: JsonObject;
  tags: Record<string, string>;
  session: string;
  seq: number;
  /** Hot restart or app launch. Isolate group on native, session on web. */
  run: string;
  isolate: string;
  /** VM service isolate id, needed to call the app's service extensions. */
  isolateId?: string;
  conn: string;
  ts: number;
  /** Arrival order, increasing across reloads. */
  n: number;
  size: number;
}

export const PREFIX = 'devpul.';
export const TRUNCATED = 'devpul.truncated';

/** Envelope `v` and handshake `protocol` this UI reads. */
export const PROTOCOL = 1;

/**
 * Null for events that are not DevPul's or are malformed, `outdated` for
 * events from a devpul package older than the `data` envelope.
 */
export function fromVm(raw: VmExtensionEvent, conn: string, n: number): DevEvent | 'outdated' | null {
  const fullKind = raw.extensionKind;
  if (!fullKind?.startsWith(PREFIX)) return null;
  const env = raw.extensionData;
  if (!isObject(env)) return null;
  if (!isObject(env.data)) return 'outdated';
  const { session, seq, ts } = env;
  if (typeof session !== 'string' || typeof seq !== 'number' || typeof ts !== 'number') return null;
  const group = raw.isolateGroup?.id || raw.isolate?.isolateGroupId || '';
  return {
    key: `${session}|${seq}`,
    kind: fullKind.slice(PREFIX.length),
    data: env.data,
    tags: stringMap(env.tags),
    session,
    seq,
    run: group ? `${conn}|${group}` : session,
    isolate: raw.isolate?.name ?? '',
    isolateId: raw.isolate?.id || undefined,
    conn,
    ts,
    n,
    size: JSON.stringify(env).length,
  };
}

export const isObject = (v: unknown): v is JsonObject => typeof v === 'object' && v !== null && !Array.isArray(v);

export const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;

export const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function stringMap(v: unknown): Record<string, string> {
  if (!isObject(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) {
    const s = str(x);
    if (s !== undefined) out[k] = s;
  }
  return out;
}

/** The fields as `key: value` pairs, cut at [max] characters. */
export function preview(e: DevEvent, max = 200): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(e.data)) {
    parts.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    if (parts.join(', ').length > max) break;
  }
  return parts.join(', ').slice(0, max);
}
