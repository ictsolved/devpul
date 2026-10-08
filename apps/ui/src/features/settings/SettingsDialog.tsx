import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Chip } from '../../components/list';
import { formatBytes } from '../../core/json';
import type { Settings } from '../../lib/storage';
import type { AppCall } from '../plugins/PluginTab';
import { type LimitApp, Limits } from './Limits';
import { NumberField } from './NumberField';

interface Props {
  open: boolean;
  settings: Settings;
  sessionKeys: string[];
  memory: { count: number; bytes: number; dropped: number };
  usage: { count: number; bytes: number } | null;
  pluginErrors: Record<string, string>;
  limitApps: LimitApp[];
  call: AppCall;
  onChange: (next: Settings) => void;
  onClear: () => void;
  onClose: () => void;
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
  const { open, settings, sessionKeys, memory, usage, pluginErrors, limitApps, call, onChange, onClear, onClose } =
    props;

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
            Events kept (MB, oldest dropped first)
            <NumberField key={settings.maxMB} value={settings.maxMB} min={1} onCommit={(v) => set('maxMB', v)} />
          </label>
          <Check checked={settings.persist} onChange={(v) => set('persist', v)}>
            Keep events in this browser across reloads (IndexedDB, same limit)
          </Check>
          <Check checked={!settings.clearOnRestart} onChange={(v) => set('clearOnRestart', !v)}>
            Keep earlier runs
          </Check>
          <p className="text-muted-foreground">
            In memory: {memory.count} events, {formatBytes(memory.bytes)}
            {memory.dropped > 0 && `; ${memory.dropped} older events dropped at the limit`}
          </p>
          {usage && (
            <p className="text-muted-foreground">
              Stored: {usage.count} events, {formatBytes(usage.bytes)}
            </p>
          )}
          <Button type="button" variant="warning" size="sm" onClick={onClear}>
            Clear all events
          </Button>

          <Heading>Limits</Heading>
          <p>Set in the app before it sends events, per kind and its dotted children. App events are never limited.</p>
          <Limits apps={limitApps} call={call} />

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
          {settings.plugins.length > 0 && (
            <>
              <p>
                Allowed from apps, one source hash per package; a changed plugin asks again. Off keeps the approval
                without loading the plugin.
              </p>
              <table className="w-full max-w-[560px] border-collapse text-left [&_td]:border-b [&_td]:py-1 [&_td]:pr-3">
                <tbody>
                  {settings.plugins.map((a) => (
                    <tr key={a.id}>
                      <td className="font-mono text-xs wrap-anywhere">{a.id}</td>
                      <td className="text-muted-foreground">{a.version}</td>
                      <td>
                        <code title={`sha256 ${a.hash}`}>{a.hash.slice(0, 12)}</code>
                      </td>
                      <td>
                        <Switch
                          size="sm"
                          aria-label={`Load ${a.id}`}
                          checked={!a.off}
                          onCheckedChange={(on) =>
                            set(
                              'plugins',
                              settings.plugins.map((p) => (p.id === a.id ? { ...p, off: !on } : p)),
                            )
                          }
                        />
                      </td>
                      <td className="text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            set(
                              'plugins',
                              settings.plugins.filter((p) => p.id !== a.id),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
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
