import { useEffect, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { type DevEvent, isObject } from '../../core/events';
import { type AppInfo, limitKey, limitParams, parseInfo } from '../../core/info';
import { rpcMessage } from '../../core/rpc';
import type { RunInfo } from '../../core/store';
import type { AppCall } from '../plugins/PluginTab';
import { NumberField } from './NumberField';

export interface LimitApp {
  name: string;
  /** A live run with an `app.info` event. */
  run: RunInfo;
  paused: boolean;
}

type SetLimit = (event: DevEvent, kind: string, perSecond: number | null) => void;

const TABLE =
  'w-full max-w-[560px] border-collapse text-left [&_td]:border-b [&_td]:py-0.5 [&_td]:pr-3 [&_th]:pr-3 [&_th]:pb-1 [&_th]:text-xs [&_th]:font-normal [&_th]:text-muted-foreground';

/** Mutes and per-second caps that the app applies before it sends events. */
export function Limits({ apps, call }: { apps: LimitApp[]; call: AppCall }) {
  // By the `app.info` event they update; a newer event replaces them.
  const [fresh, setFresh] = useState<Record<string, AppInfo>>({});
  const [error, setError] = useState<string | null>(null);
  // A paused app is asked again on resume.
  const infoKeys = apps.map((a) => (a.paused ? '' : a.run.info?.key)).join('|');

  // `dropped` in app.info is as of the last limit change; ask for current counts.
  useEffect(() => {
    for (const { run, paused } of apps) {
      const info = run.info;
      if (!info || paused) continue;
      call(info, 'ext.devpul.info').then(
        (result) => isObject(result) && setFresh((f) => ({ ...f, [info.key]: parseInfo(result) })),
        () => {},
      );
    }
    // Once per app.info event; apps is a new array on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [infoKeys, call]);

  const set: SetLimit = (event, kind, perSecond) => {
    setError(null);
    call(event, 'ext.devpul.limit', limitParams(kind, perSecond)).then(
      (result) => isObject(result) && setFresh((f) => ({ ...f, [event.key]: parseInfo(result) })),
      (err: unknown) => setError(`${kind}: ${rpcMessage(err)}`),
    );
  };

  if (!apps.length) return <p className="text-muted-foreground">Mute or cap event kinds of a connected app here.</p>;
  return (
    <>
      {apps.map(({ name, run, paused }) =>
        run.info ? (
          <AppLimits
            key={run.info.key}
            name={apps.length > 1 ? name : undefined}
            run={run}
            paused={paused}
            info={fresh[run.info.key] ?? parseInfo(run.info.data)}
            onSet={set}
          />
        ) : null,
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </>
  );
}

function AppLimits(props: { name?: string; run: RunInfo; paused: boolean; info: AppInfo; onSet: SetLimit }) {
  const { name, run, paused, info, onSet } = props;
  const event = run.info;
  if (!event) return null;
  const kinds = [
    ...new Set([...run.kinds.filter((k) => !k.startsWith('app.')), ...Object.keys(info.limits)]),
  ].toSorted();
  return (
    <div className="my-1.5">
      {name && <p className="font-medium">{name}</p>}
      {paused && <p className="text-muted-foreground">Paused in the debugger.</p>}
      {kinds.length === 0 ? (
        <p className="text-muted-foreground">No events yet.</p>
      ) : (
        <table className={TABLE}>
          <thead>
            <tr>
              <th>Kind</th>
              <th>Muted</th>
              <th>Per second</th>
              <th>Dropped</th>
            </tr>
          </thead>
          <tbody>
            {kinds.map((kind) => {
              const own = info.limits[kind];
              const via = limitKey(kind, info.limits);
              return (
                <tr key={kind}>
                  <td className="font-mono text-xs wrap-anywhere">
                    {kind}
                    {via && via !== kind && <span className="text-muted-foreground"> (via {via})</span>}
                  </td>
                  <td>
                    <Checkbox
                      aria-label={`Mute ${kind}`}
                      checked={own === 0}
                      disabled={paused}
                      onCheckedChange={(checked) => onSet(event, kind, checked === true ? 0 : null)}
                    />
                  </td>
                  <td>
                    <NumberField
                      key={own ?? 'none'}
                      className="w-20"
                      aria-label={`${kind} per second`}
                      value={own || null}
                      min={1}
                      disabled={paused || own === 0}
                      onCommit={(n) => onSet(event, kind, n)}
                      onClear={() => onSet(event, kind, null)}
                    />
                  </td>
                  <td className="text-muted-foreground tabular-nums">{info.dropped[kind] || ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
