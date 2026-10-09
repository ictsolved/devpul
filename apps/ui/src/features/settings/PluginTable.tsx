import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CopyButton } from '../../components/Copy';
import type { Approval } from '../../core/approvals';
import { checkUpdate, parseRegistry, type RegistryPlugin } from '../../core/registry';
import { registryUrl } from '../../lib/links';

type Check =
  { state: 'idle' | 'checking' } | { state: 'done'; registry: RegistryPlugin[] } | { state: 'failed'; error: string };

async function fetchRegistry(): Promise<RegistryPlugin[]> {
  const res = await fetch(registryUrl, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseRegistry(await res.json());
}

interface Props {
  approvals: Approval[];
  onChange: (approvals: Approval[]) => void;
}

/** Mounts with the dialog content, so each open starts unchecked. */
export function PluginTable({ approvals, onChange }: Props) {
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const registry = check.state === 'done' ? check.registry : undefined;
  const updates = registry && approvals.map((a) => checkUpdate(a, registry));

  const run = () => {
    setCheck({ state: 'checking' });
    fetchRegistry().then(
      (list) => setCheck({ state: 'done', registry: list }),
      (err: unknown) => setCheck({ state: 'failed', error: err instanceof Error ? err.message : String(err) }),
    );
  };

  return (
    <>
      <table className="w-full border-collapse text-left [&_td]:border-b [&_td]:py-1 [&_td]:pr-3 [&_td]:align-top [&_th]:pr-3 [&_th]:font-normal [&_th]:text-muted-foreground">
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Source</th>
            <th>Version</th>
            {updates && <th>Latest</th>}
            <th>Hash</th>
            <th>Load</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {approvals.map((a, i) => {
            const update = updates?.[i];
            return (
              <tr key={a.id}>
                <td className="font-mono text-xs">{a.id}</td>
                <td className="font-mono text-xs wrap-anywhere text-muted-foreground">{a.origin}</td>
                <td className="text-muted-foreground">{a.version}</td>
                {update && (
                  <td>
                    {update.state === 'current' && <span className="text-muted-foreground">Up to date</span>}
                    {update.state === 'unlisted' && <span className="text-muted-foreground">Can't check</span>}
                    {update.state === 'available' && <strong>{update.version}</strong>}
                  </td>
                )}
                <td>
                  <code title={`sha256 ${a.hash}`}>{a.hash.slice(0, 12)}</code>
                </td>
                <td>
                  <Switch
                    size="sm"
                    aria-label={`Load ${a.id}`}
                    checked={!a.off}
                    onCheckedChange={(on) => onChange(approvals.map((p) => (p.id === a.id ? { ...p, off: !on } : p)))}
                  />
                </td>
                <td className="text-right">
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => onChange(approvals.filter((p) => p.id !== a.id))}
                  >
                    Remove
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="my-1.5 flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={check.state === 'checking'} onClick={run}>
          {check.state === 'checking' ? 'Checking…' : 'Check for updates'}
        </Button>
        {check.state === 'failed' && <span className="text-destructive">Check failed: {check.error}</span>}
      </div>
      {updates?.some((u) => u.state === 'available') && <p>Upgrade from the app's folder:</p>}
      {updates?.map(
        (u) =>
          u.state === 'available' && (
            <p key={u.command} className="flex items-center gap-2">
              <code className="text-xs">{u.command}</code>
              <CopyButton text={() => u.command} />
            </p>
          ),
      )}
      {updates?.some((u) => u.state === 'unlisted') && (
        <p className="text-muted-foreground">
          Can't check: not in the registry from this source. <code>devpul outdated</code> in the app checks every
          source.
        </p>
      )}
    </>
  );
}
