import { Zap } from 'lucide-react';
import type { DevEvent } from '../lib/events';
import { Menu, MenuItem } from './Menu';

export interface AppActions {
  app: string;
  event: DevEvent;
  names: string[];
}

interface Props {
  apps: AppActions[];
  onRun: (event: DevEvent, name: string) => void;
}

export function ActionsMenu({ apps, onRun }: Props) {
  if (!apps.length) return null;
  return (
    <Menu label="Actions" icon={<Zap size={13} />}>
      {apps.map((a) => (
        <div key={a.event.key} className="menu-group">
          {apps.length > 1 && <div className="menu-label">{a.app}</div>}
          {a.names.map((name) => (
            <MenuItem key={name} onClick={() => onRun(a.event, name)}>
              {name}
            </MenuItem>
          ))}
        </div>
      ))}
    </Menu>
  );
}
