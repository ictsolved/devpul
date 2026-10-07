import { X, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DevEvent, Json } from '../lib/events';
import type { ActionInfo, ActionParam } from '../lib/info';
import { Menu, MenuItem } from './Menu';

export interface AppActions {
  app: string;
  event: DevEvent;
  actions: ActionInfo[];
}

export type RunAction = (event: DevEvent, name: string, args?: Record<string, Json>) => void;

interface Props {
  apps: AppActions[];
  onRun: RunAction;
}

export function ActionsMenu({ apps, onRun }: Props) {
  const [form, setForm] = useState<{ event: DevEvent; action: ActionInfo } | null>(null);
  if (!apps.length) return null;
  return (
    <>
      <Menu label="Actions" icon={<Zap size={13} />}>
        {apps.map((a) => (
          <div key={a.event.key} className="menu-group">
            {apps.length > 1 && <div className="menu-label">{a.app}</div>}
            {a.actions.map((action) => (
              <MenuItem
                key={action.name}
                onClick={() =>
                  action.params.length ? setForm({ event: a.event, action }) : onRun(a.event, action.name)
                }
              >
                {action.name}
                {action.params.length > 0 && '…'}
              </MenuItem>
            ))}
          </div>
        ))}
      </Menu>
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
  const ref = useRef<HTMLDialogElement>(null);
  const [values, setValues] = useState<Record<string, Json>>(() =>
    Object.fromEntries(action.params.map((p) => [p.name, p.initial])),
  );
  useEffect(() => {
    ref.current?.showModal();
  }, []);

  return (
    <dialog ref={ref} className="dialog narrow" onClose={onClose} aria-label={action.name}>
      <div className="dialog-head">
        <h2>{action.name}</h2>
        <button type="button" className="btn small icon" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
      <form
        className="dialog-body form"
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
        <button type="submit" className="btn primary">
          Run
        </button>
      </form>
    </dialog>
  );
}

function Field({ param, value, onChange }: { param: ActionParam; value: Json; onChange: (v: Json) => void }) {
  switch (param.type) {
    case 'flag':
      return (
        <label className="check">
          <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
          {param.name}
        </label>
      );
    case 'choice':
      return (
        <label>
          {param.name}
          <select value={String(value)} onChange={(e) => onChange(e.target.value)}>
            {param.options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </select>
        </label>
      );
    case 'number':
      return (
        <label>
          {param.name}
          <input
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
        <label>
          {param.name}
          <input
            type="text"
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
          />
        </label>
      );
  }
}
