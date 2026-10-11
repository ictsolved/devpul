import { FileDown } from 'lucide-react';
import { version } from '../../../package.json';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="xs" aria-label="Export">
          <FileDown />
          <span className="max-[560px]:hidden">Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-50">
        <DropdownMenuItem onSelect={() => download(`devpul-${stamp()}.har`, toHar(store.httpRows, version))}>
          HTTP as HAR
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => download(`devpul-${stamp()}.devpul.json`, toSession(store.all))}>
          Session file (all events)
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenFile}>Open a session file</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
