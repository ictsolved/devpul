import { type DevEvent, fromVm, type JsonObject } from './events';

let n = 0;

/** `session`, `seq`, `ts` and `tags` go to the envelope, the rest to `data`. */
export function vmEvent(
  kind: string,
  fields: JsonObject,
  opts: { isolate?: string; group?: string; conn?: string } = {},
): DevEvent {
  const { session = 's1', seq = ++n, ts = 0, tags, ...data } = fields;
  const e = fromVm(
    {
      extensionKind: `devpul.${kind}`,
      extensionData: { v: 1, session, seq, ts, ...(tags !== undefined && { tags }), data },
      isolate: { id: opts.isolate ?? 'isolates/1', name: 'main' },
      isolateGroup: { id: opts.group ?? 'isolateGroups/1' },
    },
    opts.conn ?? 'c1',
    ++n,
  );
  if (!e || e === 'outdated') throw new Error('not a devpul event');
  return e;
}
