import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatBytes } from '../../core/json';
import type { Settings } from '../../lib/storage';

interface Props {
  open: boolean;
  settings: Settings;
  sessionKeys: string[];
  usage: { count: number; bytes: number } | null;
  pluginErrors: Record<string, string>;
  onChange: (next: Settings) => void;
  onClear: () => void;
  onClose: () => void;
}

/** Digits only, no spinner; commits on blur or Enter. Key it by value to reset. */
function NumberField(props: { value: number; min: number; onCommit: (v: number) => void }) {
  const { value, min, onCommit } = props;
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Number.parseInt(text, 10);
    if (Number.isFinite(n) && n >= min) onCommit(n);
    else setText(String(value));
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => setText(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

/** Mounts with the dialog content, so each open starts from the saved list. */
function PluginUrls(props: { urls: string[]; onCommit: (urls: string[]) => void }) {
  const { urls, onCommit } = props;
  const [text, setText] = useState(urls.join('\n'));
  return (
    <textarea
      rows={3}
      value={text}
      spellCheck={false}
      placeholder="https://example.com/devpul-plugin.js"
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        onCommit(
          text
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean),
        )
      }
    />
  );
}

export function SettingsDialog(props: Props) {
  const { open, settings, sessionKeys, usage, pluginErrors, onChange, onClear, onClose } = props;

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => onChange({ ...settings, [key]: value });

  const toggleField = (k: string) => {
    const base = settings.headerFields.length ? settings.headerFields : sessionKeys.slice(0, 4);
    set('headerFields', base.includes(k) ? base.filter((x) => x !== k) : [...base, k]);
  };
  const shownFields = settings.headerFields.length ? settings.headerFields : sessionKeys.slice(0, 4);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        // Fields commit on blur, which closing alone does not fire.
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[calc(100vh-48px)] grid-rows-[auto_minmax(0,1fr)] sm:max-w-190"
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
        </DialogHeader>
        <div className="dialog-body form -mx-6 overflow-y-auto px-6">
          <h3>Slow requests</h3>
          <label>
            Amber from (ms)
            <NumberField key={settings.slowMs} value={settings.slowMs} min={1} onCommit={(v) => set('slowMs', v)} />
          </label>
          <label>
            Red from (ms)
            <NumberField
              key={settings.verySlowMs}
              value={settings.verySlowMs}
              min={1}
              onCommit={(v) => set('verySlowMs', v)}
            />
          </label>

          <h3>Storage</h3>
          <label>
            Events kept
            <NumberField
              key={settings.maxEvents}
              value={settings.maxEvents}
              min={100}
              onCommit={(v) => set('maxEvents', v)}
            />
          </label>
          <label className="check">
            <input type="checkbox" checked={settings.persist} onChange={(e) => set('persist', e.target.checked)} />
            Keep events in this browser across reloads (IndexedDB, oldest dropped first, 200 MB max)
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.clearOnRestart}
              onChange={(e) => set('clearOnRestart', e.target.checked)}
            />
            Clear an app&apos;s earlier events when it restarts or its URL is replaced
          </label>
          {usage && (
            <p className="muted">
              Stored: {usage.count} events, {formatBytes(usage.bytes)}
            </p>
          )}
          <button type="button" className="btn warn" onClick={onClear}>
            Clear all events
          </button>

          <h3>Header fields</h3>
          {sessionKeys.length === 0 ? (
            <p className="muted">Fields appear once an app sends Devpul.session.</p>
          ) : (
            <div className="chips">
              {sessionKeys.map((k) => (
                <button
                  type="button"
                  key={k}
                  className={`chip ${shownFields.includes(k) ? 'on' : ''}`}
                  onClick={() => toggleField(k)}
                >
                  {k}
                </button>
              ))}
            </div>
          )}

          <h3>Plugins</h3>
          {settings.approvedPlugins.length > 0 && (
            <>
              <p>Allowed from apps, by package and source hash. A removed plugin asks again after a reload.</p>
              <table className="kv">
                <tbody>
                  {settings.approvedPlugins.map((key) => {
                    const [id, hash = ''] = key.split('@');
                    return (
                      <tr key={key}>
                        <th>{id}</th>
                        <td>
                          <code>{hash.slice(0, 12)}</code>{' '}
                          <button
                            type="button"
                            className="btn small"
                            onClick={() =>
                              set(
                                'approvedPlugins',
                                settings.approvedPlugins.filter((k) => k !== key),
                              )
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          <label>
            Module URLs, one per line. They run with full access to this page.
            <PluginUrls urls={settings.pluginUrls} onCommit={(urls) => set('pluginUrls', urls)} />
          </label>
          {Object.entries(pluginErrors).map(([url, err]) => (
            <p key={url} className="hint err">
              {url}: {err}
            </p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
