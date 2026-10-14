import { FileDown, FileJson, FolderOpen } from 'lucide-react';
import { version } from '../../../package.json';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { toHar, toSession } from '../../core/export';
import type { Store } from '../../core/store';
import { download } from '../../lib/download';

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');

interface Props {
  store: Store;
  onOpenFile: () => void;
}

/** Export and import items for a menu. */
export function ExportItems({ store, onOpenFile }: Props) {
  return (
    <>
      <DropdownMenuItem onSelect={() => download(`devpul-${stamp()}.har`, toHar(store.httpRows, version))}>
        <FileDown /> Export HTTP as HAR
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => download(`devpul-${stamp()}.devpul.json`, toSession(store.all))}>
        <FileJson /> Export session file
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onOpenFile}>
        <FolderOpen /> Open a session file
      </DropdownMenuItem>
    </>
  );
}
