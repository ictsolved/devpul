import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { JsonObject } from '../../core/events';
import { type Editable, editOf, type PausedEdit, resumeArgs } from '../../core/mocks';
import { EditFields } from './Breakpoint';

/** A sent request, editable, to send again from the app. */
export function ReplayForm(props: {
  sent: Editable;
  onSend: (args: JsonObject) => Promise<void>;
  onCancel: () => void;
}) {
  const { sent, onSend, onCancel } = props;
  const [edit, setEdit] = useState<PausedEdit>(() => editOf(sent));
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (fields: Partial<PausedEdit>) => setEdit({ ...edit, ...fields });

  const send = async () => {
    const args = resumeArgs(sent, edit);
    if (typeof args === 'string') return setProblem(args);
    setProblem(null);
    setBusy(true);
    try {
      await onSend(args);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <section className="border-b bg-secondary/50 px-3 py-2" aria-label="Replay">
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <div className="text-xs font-semibold">Replay from the app</div>
        <EditFields held={sent} edit={edit} set={set} />
        {problem && <p className="text-xs text-destructive">{problem}</p>}
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            Send
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
