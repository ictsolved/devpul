import type { ReactNode } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { pageUrl } from '../lib/links';

function Key({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-b-2 bg-secondary px-[5px]">{children}</kbd>;
}

function Row({ keys, children }: { keys: ReactNode; children: ReactNode }) {
  return (
    <tr>
      <th className="w-[45%] border-b py-0.5 pr-2 text-left align-top font-normal whitespace-nowrap">{keys}</th>
      <td className="border-b py-0.5 pr-2 align-top">{children}</td>
    </tr>
  );
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <table className="w-full border-collapse font-mono text-xs">
            <tbody>
              <Row keys={<Key>/</Key>}>Focus the filter</Row>
              <Row
                keys={
                  <>
                    <Key>j</Key> <Key>k</Key> or <Key>↓</Key> <Key>↑</Key>
                  </>
                }
              >
                Move the selection
              </Row>
              <Row keys={<Key>Esc</Key>}>Close the detail or leave the filter</Row>
              <Row
                keys={
                  <>
                    <Key>1</Key> to <Key>9</Key>
                  </>
                }
              >
                Switch tabs
              </Row>
              <Row
                keys={
                  <>
                    <Key>r</Key> <Key>R</Key>
                  </>
                }
              >
                Hot reload, hot restart (apps started with flutter run)
              </Row>
              <Row keys={<Key>?</Key>}>This list</Row>
            </tbody>
          </table>
          <p>
            Paste a VM service URL anywhere outside a text field to connect. Drop a session file on the page to open it.
          </p>
          <p>
            <a className="text-primary" href={pageUrl('help/')} target="_blank" rel="noopener">
              Help and troubleshooting
            </a>{' '}
            ·{' '}
            <a className="text-primary" href={pageUrl('docs/')} target="_blank" rel="noopener">
              Docs
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
