import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { JsonObject } from '../../core/events';
import { pretty } from '../../core/json';
import { type Editable, editOf, type Paused, type PausedEdit, resumeArgs } from '../../core/mocks';

const FIELD = 'flex flex-col gap-1 text-xs text-muted-foreground';
const MONO = 'font-mono text-xs';

function useRemaining(until: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.round((until - now) / 1000));
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

/** The held request or response, editable, with Continue and Abort. */
export function Breakpoint(props: { paused: Paused; onResume: (args: JsonObject) => Promise<void> }) {
  const { paused, onResume } = props;
  const [edit, setEdit] = useState<PausedEdit>(() => editOf(paused));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const left = useRemaining(paused.until);
  const set = (fields: Partial<PausedEdit>) => setEdit({ ...edit, ...fields });
  const request = paused.stage === 'request';

  const send = async (args: JsonObject | string) => {
    if (typeof args === 'string') return setProblem(args);
    setProblem(null);
    setBusy(true);
    try {
      await onResume(args);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <section className="border-b border-warning/40 bg-warning/5 px-3 py-2" aria-label="Breakpoint">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(resumeArgs(paused, edit));
        }}
      >
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-warning">
            Paused {request ? 'before sending' : 'before the app gets the response'}
          </span>
          <span className="text-muted-foreground">goes on unchanged in {clock(left)}</span>
        </div>
        <EditFields held={paused} edit={edit} set={set} />
        {problem && <p className="text-xs text-destructive">{problem}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            Continue
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void send({ id: paused.id })}
          >
            Continue unchanged
          </Button>
          <Button
            type="button"
            size="sm"
            variant="warning"
            disabled={busy}
            onClick={() => void send({ id: paused.id, abort: true })}
          >
            Abort
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Method and URL or status, headers and body of [held], bound to [edit]. */
export function EditFields(props: { held: Editable; edit: PausedEdit; set: (fields: Partial<PausedEdit>) => void }) {
  const { held, edit, set } = props;
  return (
    <>
      {held.stage === 'request' ? (
        <div className="flex gap-2">
          <label className={FIELD}>
            Method
            <Input className={`${MONO} w-24`} value={edit.method} onChange={(e) => set({ method: e.target.value })} />
          </label>
          <label className={`${FIELD} min-w-0 flex-1`}>
            URL
            <Input className={MONO} value={edit.url} onChange={(e) => set({ url: e.target.value })} />
          </label>
        </div>
      ) : (
        <div className="flex gap-2">
          <label className={FIELD}>
            Status
            <Input
              className={`${MONO} w-24`}
              inputMode="numeric"
              value={edit.status}
              onChange={(e) => set({ status: e.target.value })}
            />
          </label>
          <label className={`${FIELD} min-w-0 flex-1`}>
            Status message
            <Input value={edit.statusMessage} onChange={(e) => set({ statusMessage: e.target.value })} />
          </label>
        </div>
      )}
      <label className={FIELD}>
        Headers, one name: value per line
        <Textarea className={MONO} rows={3} value={edit.headers} onChange={(e) => set({ headers: e.target.value })} />
      </label>
      {held.editable ? (
        <label className={FIELD}>
          Body{held.json ? ' (JSON)' : ''}
          <Textarea
            className={`${MONO} max-h-80`}
            rows={5}
            value={edit.body}
            onChange={(e) => set({ body: e.target.value })}
          />
        </label>
      ) : (
        held.body !== null && (
          <div className={FIELD}>
            Body, not editable: not text, redacted or over the size limit
            <pre className={`${MONO} max-h-40 overflow-auto text-foreground`}>
              {typeof held.body === 'string' ? held.body : pretty(held.body)}
            </pre>
          </div>
        )
      )}
    </>
  );
}
