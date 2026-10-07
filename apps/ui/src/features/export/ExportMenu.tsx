import { FileDown } from 'lucide-react';
import { version } from '../../../package.json';
import { Menu, MenuItem } from '../../components/Menu';
import { toHar, toSession } from '../../core/export';
import type { Store } from '../../core/store';
import { download } from '../../lib/download';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

interface Props {
  store: Store;
  onOpenFile: () => void;
}

export function ExportMenu({ store, onOpenFile }: Props) {
  return (
    <Menu label="Export" icon={<FileDown size={13} />}>
      <MenuItem onClick={() => download(`devpul-${stamp()}.har`, toHar(store.httpRows, version))}>HTTP as HAR</MenuItem>
      <MenuItem onClick={() => download(`devpul-${stamp()}.devpul.json`, toSession(store.all))}>
        Session file (all events)
      </MenuItem>
      <MenuItem onClick={onOpenFile}>Open a session file</MenuItem>
    </Menu>
  );
}
