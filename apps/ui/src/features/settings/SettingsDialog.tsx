import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { kvClass } from '../../components/JsonView';
import { Chip } from '../../components/list';
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
    <Input
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
    <Textarea
      className="font-mono text-xs"
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

const LABEL = 'my-1.5 flex max-w-[420px] flex-col gap-1';

function Heading({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1.5 text-[13px] font-bold">{children}</h3>;
}

function Check(props: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="my-1.5 flex items-center gap-2">
      <Checkbox checked={props.checked} onCheckedChange={(checked) => props.onChange(checked === true)} />
      {props.children}
    </label>
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
        <div className="-mx-6 overflow-y-auto px-6 [&_p]:my-1.5">
          <Heading>Slow requests</Heading>
          <label className={LABEL}>
            Amber from (ms)
            <NumberField key={settings.slowMs} value={settings.slowMs} min={1} onCommit={(v) => set('slowMs', v)} />
          </label>
          <label className={LABEL}>
            Red from (ms)
            <NumberField
              key={settings.verySlowMs}
              value={settings.verySlowMs}
              min={1}
              onCommit={(v) => set('verySlowMs', v)}
            />
          </label>

          <Heading>Storage</Heading>
          <label className={LABEL}>
            Events kept
            <NumberField
              key={settings.maxEvents}
              value={settings.maxEvents}
              min={100}
              onCommit={(v) => set('maxEvents', v)}
            />
          </label>
          <Check checked={settings.persist} onChange={(v) => set('persist', v)}>
            Keep events in this browser across reloads (IndexedDB, oldest dropped first, 200 MB max)
          </Check>
          <Check checked={settings.clearOnRestart} onChange={(v) => set('clearOnRestart', v)}>
            Clear an app&apos;s earlier events when it restarts or its URL is replaced
          </Check>
          {usage && (
            <p className="text-muted-foreground">
              Stored: {usage.count} events, {formatBytes(usage.bytes)}
            </p>
          )}
          <Button type="button" variant="warning" size="sm" onClick={onClear}>
            Clear all events
          </Button>

          <Heading>Header fields</Heading>
          {sessionKeys.length === 0 ? (
            <p className="text-muted-foreground">Fields appear once an app sends Devpul.session.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {sessionKeys.map((k) => (
                <Chip key={k} on={shownFields.includes(k)} onClick={() => toggleField(k)}>
                  {k}
                </Chip>
              ))}
            </div>
          )}

          <Heading>Plugins</Heading>
          {settings.approvedPlugins.length > 0 && (
            <>
              <p>Allowed from apps, by package and source hash. A removed plugin asks again after a reload.</p>
              <table className={kvClass.table}>
                <tbody>
                  {settings.approvedPlugins.map((key) => {
                    const [id, hash = ''] = key.split('@');
                    return (
                      <tr key={key}>
                        <th className={kvClass.key}>{id}</th>
                        <td className={kvClass.value}>
                          <code>{hash.slice(0, 12)}</code>{' '}
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            onClick={() =>
                              set(
                                'approvedPlugins',
                                settings.approvedPlugins.filter((k) => k !== key),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}
          <label className={LABEL}>
            Module URLs, one per line. They run with full access to this page.
            <PluginUrls urls={settings.pluginUrls} onCommit={(urls) => set('pluginUrls', urls)} />
          </label>
          {Object.entries(pluginErrors).map(([url, err]) => (
            <p key={url} className="text-xs text-destructive">
              {url}: {err}
            </p>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
