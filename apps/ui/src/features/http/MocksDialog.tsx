import { ArrowUp, Pencil, Trash2 } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Tip } from '../../components/Tip';
import {
  describeRule,
  headersText,
  type MockMode,
  type MockRule,
  MODES,
  newRule,
  parseHeaders,
} from '../../core/mocks';
import type { MockApp } from './useMocks';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const MODE_LABELS: Record<MockMode, string> = {
  respond: 'Respond',
  fail: 'Fail as a network error',
  delay: 'Delay, then send',
  pause: 'Pause to edit',
};
const FIELD = 'flex flex-col gap-1 text-xs text-muted-foreground';
const MONO = 'font-mono text-xs';

interface Props {
  open: boolean;
  apps: MockApp[];
  /** Run of the app to show first. */
  run?: string;
  /** A new rule to open in the editor. */
  draft?: MockRule;
  /** A note on the draft, such as a body that did not come along. */
  draftNote?: string;
  keep: boolean;
  onKeep: (keep: boolean) => void;
  onSet: (app: MockApp, rules: MockRule[]) => Promise<void>;
  onClose: () => void;
}

export function MocksDialog(props: Props) {
  const { open, onClose } = props;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[calc(100vh-48px)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-190">
        <DialogHeader>
          <DialogTitle>Mocks</DialogTitle>
          <DialogDescription>
            Rules for calls through devpul_http and devpul_dio, checked in order; the first that matches applies.
            {props.keep
              ? ' This browser sends them again when the app restarts.'
              : ' They last until the app restarts.'}
          </DialogDescription>
        </DialogHeader>
        {/* Mounted per opening, so its state starts from the props. */}
        <MocksPanel {...props} />
      </DialogContent>
    </Dialog>
  );
}

function MocksPanel(props: Props) {
  const { apps, run, draft, draftNote, keep, onKeep, onSet } = props;
  const [picked, setPicked] = useState<string | undefined>(run);
  const [editing, setEditing] = useState<MockRule | null>(draft ?? null);
  const [note] = useState<string | undefined>(draft ? draftNote : undefined);
  const [error, setError] = useState<string | null>(null);

  const app = apps.find((a) => a.run.run === picked) ?? apps[0];
  const rules = app?.rules;

  const apply = async (next: MockRule[]) => {
    if (!app) return false;
    setError(null);
    try {
      await onSet(app, next);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const save = async (rule: MockRule) => {
    if (!rules) return;
    const at = rules.findIndex((r) => r.id === rule.id);
    // New rules go first: they are usually the more specific ones.
    const next = at < 0 ? [rule, ...rules] : rules.map((r) => (r.id === rule.id ? rule : r));
    if (await apply(next)) setEditing(null);
  };

  return (
    <div className="-mx-6 flex flex-col gap-3 overflow-y-auto px-6 text-[13px]">
      {!app ? (
        <p className="text-muted-foreground">
          Connect an app on devpul 1.1 or later, with devpul_http or devpul_dio, to set mocks.
        </p>
      ) : (
        <>
          {apps.length > 1 && (
            <label className={FIELD}>
              App
              <NativeSelect value={app.run.run} onChange={(e) => setPicked(e.target.value)}>
                {apps.map((a) => (
                  <NativeSelectOption key={a.run.run} value={a.run.run}>
                    {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          )}
          {editing ? (
            <RuleEditor
              key={editing.id}
              rule={editing}
              note={note}
              onSave={(r) => void save(r)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <>
              <RuleList
                rules={rules}
                onToggle={(r, on) => rules && void apply(rules.map((x) => (x.id === r.id ? { ...x, on } : x)))}
                onEdit={setEditing}
                onFirst={(r) => rules && void apply([r, ...rules.filter((x) => x.id !== r.id)])}
                onDelete={(r) => rules && void apply(rules.filter((x) => x.id !== r.id))}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" disabled={!rules} onClick={() => setEditing(newRule({ url: '*' }))}>
                  Add rule
                </Button>
                <Tip content="Fails every call as a network error while it is on.">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!rules}
                    onClick={() =>
                      rules && void apply([newRule({ url: '*', mode: 'fail', message: 'Offline' }), ...rules])
                    }
                  >
                    Simulate offline
                  </Button>
                </Tip>
              </div>
            </>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
        </>
      )}
      <label className="flex items-center gap-2">
        <Checkbox checked={keep} onCheckedChange={(v) => onKeep(v === true)} />
        Keep rules across restarts: this browser saves them per app and sends them to its next run
      </label>
    </div>
  );
}

function RuleList(props: {
  rules?: MockRule[];
  onToggle: (rule: MockRule, on: boolean) => void;
  onEdit: (rule: MockRule) => void;
  onFirst: (rule: MockRule) => void;
  onDelete: (rule: MockRule) => void;
}) {
  const { rules, onToggle, onEdit, onFirst, onDelete } = props;
  if (!rules) return <p className="text-muted-foreground">Asking the app…</p>;
  if (!rules.length) {
    return <p className="text-muted-foreground">No rules. Add one here, or use Mock on a request in the list.</p>;
  }
  return (
    <ul className="flex flex-col divide-y rounded-md border" aria-label="Mock rules">
      {rules.map((r, i) => (
        <li key={r.id} className="flex items-center gap-2 px-2 py-1.5">
          <Switch
            size="sm"
            checked={r.on}
            onCheckedChange={(on) => onToggle(r, on)}
            aria-label={`${r.on ? 'Turn off' : 'Turn on'} ${r.url}`}
          />
          <div className="flex min-w-0 flex-1 flex-col">
            <Tip content={r.url} code whenCut>
              <span className={`${MONO} truncate ${r.on ? '' : 'text-muted-foreground'}`}>
                <span className="font-semibold">{r.method ?? '*'}</span> {r.url}
              </span>
            </Tip>
            <span className="truncate text-xs text-muted-foreground">{describeRule(r)}</span>
          </div>
          {i > 0 && (
            <IconButton label="Move to the top" onClick={() => onFirst(r)}>
              <ArrowUp />
            </IconButton>
          )}
          <IconButton label="Edit" onClick={() => onEdit(r)}>
            <Pencil />
          </IconButton>
          <IconButton label="Delete" onClick={() => onDelete(r)}>
            <Trash2 />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tip content={label}>
      <Button type="button" variant="ghost" size="icon-sm" aria-label={label} onClick={onClick}>
        {children}
      </Button>
    </Tip>
  );
}

function RuleEditor(props: { rule: MockRule; note?: string; onSave: (rule: MockRule) => void; onCancel: () => void }) {
  const { note, onSave, onCancel } = props;
  const [rule, setRule] = useState(props.rule);
  const [headers, setHeaders] = useState(() => headersText(props.rule.headers));
  const [problem, setProblem] = useState<string | null>(null);
  const set = (fields: Partial<MockRule>) => setRule({ ...rule, ...fields });

  const submit = () => {
    if (!rule.url.trim()) return setProblem('Add a URL. * matches any run of characters.');
    if (rule.mode === 'respond' && (!Number.isInteger(rule.status) || rule.status < 100 || rule.status > 599)) {
      return setProblem('Status is a number from 100 to 599.');
    }
    if (rule.mode === 'pause' && !rule.request && !rule.response) {
      return setProblem('Pause the request, the response or both.');
    }
    onSave({ ...rule, url: rule.url.trim(), headers: parseHeaders(headers) });
  };

  return (
    <form
      className="flex flex-col gap-2.5"
      aria-label="Mock rule"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-wrap gap-2">
        <label className={FIELD}>
          Method
          <NativeSelect value={rule.method ?? ''} onChange={(e) => set({ method: e.target.value || null })}>
            <NativeSelectOption value="">Any</NativeSelectOption>
            {METHODS.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {m}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className={`${FIELD} min-w-60 flex-1`}>
          URL, * for any run of characters
          <Input className={MONO} value={rule.url} onChange={(e) => set({ url: e.target.value })} />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <label className={FIELD}>
          Then
          <NativeSelect value={rule.mode} onChange={(e) => set({ mode: e.target.value as MockMode })}>
            {MODES.map((m) => (
              <NativeSelectOption key={m} value={m}>
                {MODE_LABELS[m]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        {rule.mode !== 'pause' && (
          <label className={FIELD}>
            Delay (ms)
            <Input
              className="w-28"
              type="number"
              min={0}
              max={600000}
              value={rule.delayMs}
              onChange={(e) => set({ delayMs: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
            />
          </label>
        )}
        {rule.mode === 'respond' && (
          <label className={FIELD}>
            Status
            <Input
              className="w-24"
              type="number"
              min={100}
              max={599}
              value={rule.status}
              onChange={(e) => set({ status: Math.round(Number(e.target.value)) })}
            />
          </label>
        )}
      </div>
      {rule.mode === 'respond' && (
        <>
          <label className={FIELD}>
            Headers, one name: value per line
            <Textarea className={MONO} rows={3} value={headers} onChange={(e) => setHeaders(e.target.value)} />
          </label>
          <label className={FIELD}>
            Body
            <Textarea
              className={`${MONO} max-h-80`}
              rows={6}
              value={rule.body}
              onChange={(e) => set({ body: e.target.value })}
            />
          </label>
          {note && <p className="text-xs text-warning">{note}</p>}
        </>
      )}
      {rule.mode === 'fail' && (
        <label className={FIELD}>
          Error message
          <Input value={rule.message} onChange={(e) => set({ message: e.target.value })} />
        </label>
      )}
      {rule.mode === 'pause' && (
        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2">
            <Checkbox checked={rule.request} onCheckedChange={(v) => set({ request: v === true })} />
            Before the request goes out
          </label>
          <label className="flex items-center gap-2">
            <Checkbox checked={rule.response} onCheckedChange={(v) => set({ response: v === true })} />
            Before the app gets the response
          </label>
          <p className="text-xs text-muted-foreground">
            Paused calls show in the list; edit them in the detail panel. A call goes on unchanged after 5 minutes, or
            once no DevPul page or agent is connected. The app's own timeouts still run.
          </p>
        </div>
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm">
          Save rule
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
