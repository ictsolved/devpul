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
  data: JsonObject;
  session: string;
  seq: number | null;
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

export function fromVm(
  raw: VmExtensionEvent,
  conn: string,
  n: number,
): DevEvent | null {
  const fullKind = raw.extensionKind;
  if (!fullKind?.startsWith(PREFIX)) return null;
  const data = isObject(raw.extensionData) ? raw.extensionData : {};
  const kind = fullKind.slice(PREFIX.length);
  const isolateId = raw.isolate?.id ?? '';
  const session = str(data.session) ?? `${conn}|${isolateId}`;
  const seq = typeof data.seq === 'number' ? data.seq : null;
  const ts = typeof data.ts === 'number' ? data.ts : raw.timestamp ?? Date.now();
  const group = raw.isolateGroup?.id || raw.isolate?.isolateGroupId || '';
  const size = JSON.stringify(data).length;
  return {
    key:
      seq === null
        ? `${session}|${kind}|${raw.timestamp ?? ts}|${size}`
        : `${session}|${seq}`,
    kind,
    data,
    session,
    seq,
    run: group ? `${conn}|${group}` : session,
    isolate: raw.isolate?.name ?? '',
    isolateId: isolateId || undefined,
    conn,
    ts,
    n,
    size,
  };
}

export const isObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const str = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : undefined;

export const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

export function tagsOf(e: DevEvent): Record<string, string> {
  const tags = e.data.tags;
  if (!isObject(tags)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags)) {
    const s = str(v);
    if (s !== undefined) out[k] = s;
  }
  return out;
}
