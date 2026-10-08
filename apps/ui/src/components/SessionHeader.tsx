import { type DevEvent, type Json, str } from '../core/events';
import { formatTime } from '../core/json';
import { Tip } from './Tip';

const DEFAULT_COUNT = 4;

export function sessionFields(e: DevEvent | undefined): [string, Json][] {
  if (!e) return [];
  return Object.entries(e.data);
}

export function appName(session: DevEvent | undefined): string | undefined {
  if (!session) return undefined;
  const d = session.data;
  return (
    str(d.name) ??
    str(d.app) ??
    sessionFields(session)
      .map(([, v]) => str(v))
      .find(Boolean)
  );
}

interface Props {
  session: DevEvent | undefined;
  fields: string[];
  runs: number;
}

export function SessionHeader({ session, fields, runs }: Props) {
  if (!session) return null;
  const all = sessionFields(session);
  const shown = fields.length ? all.filter(([k]) => fields.includes(k)) : all.slice(0, DEFAULT_COUNT);
  const tip = JSON.stringify(Object.fromEntries(all), null, 2);
  return (
    <Tip content={tip} code align="end">
      <div className="flex min-w-0 flex-1 justify-end gap-3.5 overflow-hidden text-xs whitespace-nowrap max-[860px]:hidden">
        {shown.map(([k, v]) => (
          <span key={k} className="truncate">
            <span className="text-muted-foreground">{k}</span> {typeof v === 'string' ? v : JSON.stringify(v)}
          </span>
        ))}
        <span className="text-muted-foreground">started {formatTime(session.ts)}</span>
        {runs > 1 && <span className="text-muted-foreground">{runs} runs</span>}
      </div>
    </Tip>
  );
}
