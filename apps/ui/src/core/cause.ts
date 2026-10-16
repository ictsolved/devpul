import { isObject, num, str } from './events';

/** What started an HTTP call, from its request's `cause`. */
export type Cause =
  { type: 'replay'; id: string } | { type: 'action'; name: string } | { type: 'event'; kind: string; seq?: number };

export function parseCause(v: unknown): Cause | undefined {
  if (!isObject(v)) return undefined;
  const id = str(v.id);
  const seq = num(v.seq);
  if (v.type === 'replay' && id !== undefined) return { type: 'replay', id };
  if (v.type === 'action' && typeof v.name === 'string') return { type: 'action', name: v.name };
  if (v.type === 'event' && typeof v.kind === 'string') {
    return seq === undefined ? { type: 'event', kind: v.kind } : { type: 'event', kind: v.kind, seq };
  }
  return undefined;
}
