import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { pageUrl } from '../lib/links';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog ref={ref} className="dialog narrow" onClose={onClose} aria-label="Keyboard shortcuts">
      <div className="dialog-head">
        <h2>Keyboard shortcuts</h2>
        <button type="button" className="btn small icon" onClick={onClose} aria-label="Close">
          <X size={14} />
        </button>
      </div>
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
          Paste a VM service URL anywhere outside a text field to connect. Drop a session file on
          the page to open it.
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
    </dialog>
  );
}
