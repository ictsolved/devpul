import { type DevEvent, fromVm, type JsonObject } from './events';

let n = 0;

export function vmEvent(
  kind: string,
  data: JsonObject,
  opts: { isolate?: string; group?: string; conn?: string } = {},
): DevEvent {
  const e = fromVm(
    {
      extensionKind: `devpul.${kind}`,
      extensionData: data,
      isolate: { id: opts.isolate ?? 'isolates/1', name: 'main' },
      isolateGroup: { id: opts.group ?? 'isolateGroups/1' },
      timestamp: typeof data.ts === 'number' ? data.ts : 0,
    },
    opts.conn ?? 'c1',
    ++n,
  );
  if (!e) throw new Error('not a devpul event');
  return e;
}
