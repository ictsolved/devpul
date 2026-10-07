import { type DevEvent, type Json, str } from '../core/events';
import { formatTime } from '../core/json';

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
    <div className="session" data-tip={tip} data-tip-code>
      {shown.map(([k, v]) => (
        <span key={k} className="field">
          <span className="muted">{k}</span> {typeof v === 'string' ? v : JSON.stringify(v)}
        </span>
      ))}
      <span className="muted">started {formatTime(session.ts)}</span>
      {runs > 1 && <span className="muted">{runs} runs</span>}
    </div>
  );
}
