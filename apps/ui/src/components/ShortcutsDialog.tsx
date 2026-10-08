import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { pageUrl } from '../lib/links';

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
        <div className="dialog-body">
          <table className="kv keys">
            <tbody>
              <tr>
                <th>
                  <kbd>/</kbd>
                </th>
                <td>Focus the filter</td>
              </tr>
              <tr>
                <th>
                  <kbd>j</kbd> <kbd>k</kbd> or <kbd>↓</kbd> <kbd>↑</kbd>
                </th>
                <td>Move the selection</td>
              </tr>
              <tr>
                <th>
                  <kbd>Esc</kbd>
                </th>
                <td>Close the detail or leave the filter</td>
              </tr>
              <tr>
                <th>
                  <kbd>1</kbd> to <kbd>9</kbd>
                </th>
                <td>Switch tabs</td>
              </tr>
              <tr>
                <th>
                  <kbd>?</kbd>
                </th>
                <td>This list</td>
              </tr>
            </tbody>
          </table>
          <p>
            Paste a VM service URL anywhere outside a text field to connect. Drop a session file on the page to open it.
          </p>
          <p>
            <a href={pageUrl('help/')} target="_blank" rel="noopener">
              Help and troubleshooting
            </a>{' '}
            ·{' '}
            <a href={pageUrl('docs/')} target="_blank" rel="noopener">
              Docs
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
