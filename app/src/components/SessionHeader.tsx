import type { DevEvent, Json } from '../lib/events';
import { formatTime } from '../lib/json';

const ENVELOPE = new Set(['v', 'session', 'seq', 'ts', 'tags']);
const DEFAULT_COUNT = 4;

export function sessionFields(e: DevEvent | undefined): [string, Json][] {
  if (!e) return [];
  return Object.entries(e.data).filter(([k]) => !ENVELOPE.has(k));
}

interface Props {
  session: DevEvent | undefined;
  fields: string[];
  runs: number;
}

export function SessionHeader({ session, fields, runs }: Props) {
  if (!session) return null;
  const all = sessionFields(session);
  const shown = fields.length
    ? all.filter(([k]) => fields.includes(k))
    : all.slice(0, DEFAULT_COUNT);
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
