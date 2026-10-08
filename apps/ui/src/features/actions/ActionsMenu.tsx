import { Zap } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { appName } from '../../components/SessionHeader';
import type { DevEvent, Json } from '../../core/events';
import { type ActionInfo, type ActionParam, parseInfo } from '../../core/info';
import type { ConnState } from '../../core/rpc';
import { latestRuns, type RunInfo } from '../../core/store';

export interface AppActions {
  app: string;
  event: DevEvent;
  actions: ActionInfo[];
}

export type RunAction = (event: DevEvent, name: string, args?: Record<string, Json>) => void;

/** The latest run of each live connection that offers actions. */
export function appActions(runs: ReadonlyMap<string, RunInfo>, states: Record<string, ConnState>): AppActions[] {
  return latestRuns(runs).flatMap((r) => {
    if (!r.info || states[r.conn]?.status !== 'open') return [];
    const list = parseInfo(r.info.data).actions;
    return list.length ? [{ app: appName(r.session) ?? r.conn, event: r.info, actions: list }] : [];
  });
}

// Service extension errors carry the app's message in data.details.
export function rpcMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const data = 'data' in err ? err.data : undefined;
  if (data && typeof data === 'object' && 'details' in data) return String(data.details);
  return 'message' in err ? String(err.message) : String(err);
}

interface Props {
  apps: AppActions[];
  onRun: RunAction;
}

export function ActionsMenu({ apps, onRun }: Props) {
  const [form, setForm] = useState<{ event: DevEvent; action: ActionInfo } | null>(null);
  if (!apps.length) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="xs">
            <Zap />
            Actions
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="min-w-50"
          // Focusing the trigger would move focus out of a form opened from the menu and close it.
          onCloseAutoFocus={(e) => form && e.preventDefault()}
        >
          {apps.map((a) => (
            <DropdownMenuGroup key={a.event.key}>
              {apps.length > 1 && (
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{a.app}</DropdownMenuLabel>
              )}
              {a.actions.map((action) => (
                <DropdownMenuItem
                  key={action.name}
                  onSelect={() =>
                    action.params.length ? setForm({ event: a.event, action }) : onRun(a.event, action.name)
                  }
                >
                  {action.name}
                  {action.params.length > 0 && '…'}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {form && (
        <ActionDialog
          key={`${form.event.key}|${form.action.name}`}
          action={form.action}
          onRun={(args) => onRun(form.event, form.action.name, args)}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

function ActionDialog(props: { action: ActionInfo; onRun: (args: Record<string, Json>) => void; onClose: () => void }) {
  const { action, onRun, onClose } = props;
  const [values, setValues] = useState<Record<string, Json>>(() =>
    Object.fromEntries(action.params.map((p) => [p.name, p.initial])),
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{action.name}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col items-start gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            onRun(values);
            onClose();
          }}
        >
          {action.params.map((p) => (
            <Field
              key={p.name}
              param={p}
              value={values[p.name] ?? null}
              onChange={(v) => setValues({ ...values, [p.name]: v })}
            />
          ))}
          <Button type="submit" size="sm">
            Run
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const LABEL = 'flex w-full max-w-[420px] flex-col gap-1';

function Field({ param, value, onChange }: { param: ActionParam; value: Json; onChange: (v: Json) => void }) {
  switch (param.type) {
    case 'flag':
      return (
        <label className="flex items-center gap-2">
          <Checkbox checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />
          {param.name}
        </label>
      );
    case 'choice':
      return (
        <label className={LABEL}>
          {param.name}
          <NativeSelect value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {param.options.map((o) => (
              <NativeSelectOption key={o}>{o}</NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
      );
    case 'number':
      return (
        <label className={LABEL}>
          {param.name}
          <Input
            className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            type="number"
            step="any"
            required
            defaultValue={typeof value === 'number' ? value : ''}
            onChange={(e) => {
              if (e.target.value !== '') onChange(Number(e.target.value));
            }}
          />
        </label>
      );
    default:
      return (
        <label className={LABEL}>
          {param.name}
          <Input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}
