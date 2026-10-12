import { type DevEvent, isObject, type JsonObject, num, str } from './events';

/** `data.source` of a `developer.log` record, which reaches the UI over the VM's Logging stream. */
export const DEVELOPER_LOG = 'developer.log';

// package:logging's levels; developer.log defaults to 0.
const LEVELS: [number, string][] = [
  [1200, 'shout'],
  [1000, 'severe'],
  [900, 'warning'],
  [800, 'info'],
  [700, 'config'],
  [500, 'fine'],
  [400, 'finer'],
  [1, 'finest'],
];

export const levelName = (value: number): string => LEVELS.find(([min]) => value >= min)?.[1] ?? 'info';

/** Where the rest of a cut record lives in the app: VM object ids. */
export interface LogObjects {
  /** A message cut at the VM's 128 characters. */
  message?: string;
  length?: number;
  /** An error or stack trace the VM sends no text for: `toString` in the app gives it. */
  error?: string;
  stack?: string;
}

const instance = (v: unknown): JsonObject | undefined => (isObject(v) && v.kind !== 'Null' ? v : undefined);

// The instance's text as far as the VM sent it; [later] gets the id when the rest needs `toString`.
function refText(ref: JsonObject | undefined, later: (id: string) => void): string | undefined {
  if (!ref) return undefined;
  const value = str(ref.valueAsString);
  if ((value === undefined || ref.valueAsStringIsTruncated === true) && typeof ref.id === 'string') later(ref.id);
  return value;
}

// FNV-1a.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * A `Logging` stream event as a log entry, or null when it has no record.
 * DDS replays its buffer to every new client, so the key comes from the record:
 * one session per isolate, and a seq that grows with the record's time.
 */
export function fromLogging(event: JsonObject, ids: { conn: string; run: string; n: number }): DevEvent | null {
  const record = event.logRecord;
  if (!isObject(record)) return null;
  const message = instance(record.message);
  const error = instance(record.error);
  const stack = instance(record.stackTrace);
  const objects: JsonObject = {};
  if (message?.valueAsStringIsTruncated === true && typeof message.id === 'string') {
    objects.message = message.id;
    const length = num(message.length);
    if (length !== undefined) objects.length = length;
  }
  // An error with no text shows its class until the row is opened.
  const errorText =
    refText(error, (id) => (objects.error = id)) ?? (isObject(error?.class) ? str(error.class.name) : undefined);
  const stackText = refText(stack, (id) => (objects.stack = id));
  const data: JsonObject = {
    level: levelName(num(record.level) ?? 0),
    message: str(message?.valueAsString) ?? '',
    source: DEVELOPER_LOG,
  };
  const name = str(instance(record.loggerName)?.valueAsString);
  if (name) data.name = name;
  if (errorText !== undefined) data.error = errorText;
  if (stackText) data.stack = stackText;
  if (Object.keys(objects).length) data.objects = objects;
  const iso = isObject(event.isolate) ? event.isolate : {};
  const ts = num(record.time) ?? num(event.timestamp) ?? 0;
  const session = `log:${str(iso.id) ?? ids.conn}`;
  const seq = ts * 1000 + (hash(`${num(record.sequenceNumber)}|${JSON.stringify(data)}`) % 1000);
  return {
    key: `${session}|${seq}`,
    kind: 'log',
    data,
    tags: {},
    session,
    seq,
    run: ids.run,
    isolate: str(iso.name) ?? '',
    isolateId: str(iso.id),
    conn: ids.conn,
    ts,
    n: ids.n,
    size: JSON.stringify(data).length,
  };
}

export const logObjects = (e: DevEvent): LogObjects | undefined => {
  const o = e.data.objects;
  if (!isObject(o)) return undefined;
  return { message: str(o.message), length: num(o.length), error: str(o.error), stack: str(o.stack) };
};

type Call = (method: string, params: Record<string, unknown>) => Promise<unknown>;

// An expired id comes back as a Sentinel result, not an RPC error.
function stringOf(result: unknown): string {
  if (isObject(result) && result.type === 'Sentinel') {
    throw new Error('The app no longer holds this value.');
  }
  const text = isObject(result) ? str(result.valueAsString) : undefined;
  if (text === undefined) throw new Error('The app did not return a string.');
  return text;
}

async function fullString(call: Call, isolateId: string, ref: unknown): Promise<string> {
  if (isObject(ref) && ref.valueAsStringIsTruncated !== true) return stringOf(ref);
  const objectId = isObject(ref) ? ref.id : undefined;
  const count = isObject(ref) ? num(ref.length) : undefined;
  return stringOf(await call('getObject', { isolateId, objectId, offset: 0, ...(count !== undefined && { count }) }));
}

const toText = (call: Call, isolateId: string, targetId: string) =>
  call('invoke', { isolateId, targetId, selector: 'toString', argumentIds: [] }).then((ref) =>
    fullString(call, isolateId, ref),
  );

/** The full message, error and stack trace of a cut record, read from the app. */
export async function loadFull(
  call: Call,
  isolateId: string,
  objects: LogObjects,
): Promise<{ message?: string; error?: string; stack?: string }> {
  const [message, error, stack] = await Promise.all([
    objects.message &&
      fullString(call, isolateId, { id: objects.message, length: objects.length, valueAsStringIsTruncated: true }),
    objects.error && toText(call, isolateId, objects.error),
    objects.stack && toText(call, isolateId, objects.stack),
  ]);
  return { ...(message && { message }), ...(error && { error }), ...(stack && { stack }) };
}
