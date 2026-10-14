import { MousePointerClick } from 'lucide-react';
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
import { Tip } from '../../components/Tip';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { DevEvent, Json } from '../../core/events';
import { type ActionInfo, type ActionParam, parseInfo } from '../../core/info';
import { type ConnState, isPaused } from '../../core/rpc';
import { appName } from '../../core/session';
import { latestRuns, type RunInfo } from '../../core/store';

export interface AppActions {
  app: string;
  event: DevEvent;
  actions: ActionInfo[];
  /** Stopped in the debugger; an action sent now would run on resume. */
  paused: boolean;
}

export type RunAction = (event: DevEvent, name: string, args?: Record<string, Json>) => void;

/** The latest run of each live connection that offers actions. */
export function appActions(runs: ReadonlyMap<string, RunInfo>, states: Record<string, ConnState>): AppActions[] {
  return latestRuns(runs).flatMap((r) => {
    if (!r.info || states[r.conn]?.status !== 'open') return [];
    const list = parseInfo(r.info.data).actions;
    if (!list.length) return [];
    return [
      {
        app: appName(r.session) ?? r.conn,
        event: r.info,
        actions: list,
        paused: isPaused(states[r.conn], r.info.isolateId),
      },
    ];
  });
}

// Service extension errors carry the app's message in data.details.
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
        <Tip content="Run code in the app">
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label="Actions">
              <MousePointerClick />
              Actions
            </Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent
          align="end"
          className="min-w-50"
          // Focusing the trigger would move focus out of a form opened from the menu and close it.
          onCloseAutoFocus={(e) => form && e.preventDefault()}
        >
          {apps.map((a) => (
            <DropdownMenuGroup key={a.event.key}>
              {(apps.length > 1 || a.paused) && (
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  {apps.length > 1 && a.app}
                  {apps.length > 1 && a.paused && ': '}
                  {a.paused && 'paused in the debugger'}
                </DropdownMenuLabel>
              )}
              {a.actions.map((action) => (
                <DropdownMenuItem
                  key={action.name}
                  disabled={a.paused}
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
          paused={apps.find((a) => a.event.key === form.event.key)?.paused ?? false}
          onRun={(args) => onRun(form.event, form.action.name, args)}
          onClose={() => setForm(null)}
        />
      )}
    </>
  );
}

function ActionDialog(props: {
  action: ActionInfo;
  paused: boolean;
  onRun: (args: Record<string, Json>) => void;
  onClose: () => void;
}) {
  const { action, paused, onRun, onClose } = props;
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
          <Button type="submit" size="sm" disabled={paused}>
            Run
          </Button>
          {paused && <p className="text-xs text-muted-foreground">The app is paused in the debugger.</p>}
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
