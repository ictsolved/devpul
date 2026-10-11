import { ExternalLink, Puzzle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { CopyButton } from '../../components/Copy';
import { Tip } from '../../components/Tip';
import type { Approval } from '../../core/approvals';
import { checkUpdate, parseRegistry, type RegistryPlugin, sourceHref } from '../../core/registry';
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

/** Mounts with the Plugins view, so each visit starts unchecked. */
export function PluginList({ approvals, onChange }: Props) {
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

  const set = (id: string, change: Partial<Approval>) =>
    onChange(approvals.map((p) => (p.id === id ? { ...p, ...change } : p)));

  return (
    <>
      <ul className="divide-y border-y" aria-label="Installed plugins">
        {approvals.map((a, i) => {
          const update = updates?.[i];
          const href = sourceHref(a.origin);
          return (
            <li key={a.id} className="flex items-start gap-2.5 py-2">
              <span className="mt-0.5 inline-flex flex-none text-muted-foreground [&_svg]:size-4" aria-hidden>
                {a.icon ? <span className="inline-flex" dangerouslySetInnerHTML={{ __html: a.icon }} /> : <Puzzle />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <Tip content={a.origin ?? 'Source unknown'} code side="top" align="start">
                    <span className="font-mono text-xs font-semibold">{a.id}</span>
                  </Tip>
                  <Tip content={`sha256 ${a.hash}`} code side="top">
                    <span className="text-xs text-muted-foreground">{a.version ?? 'no version'}</span>
                  </Tip>
                  {update?.state === 'available' && (
                    <Badge variant="secondary" className="font-normal">
                      {update.version} available
                    </Badge>
                  )}
                  {update?.state === 'current' && <span className="text-xs text-muted-foreground">Up to date</span>}
                  {update?.state === 'unlisted' && <span className="text-xs text-muted-foreground">Can't check</span>}
                  {a.off && <span className="text-xs text-warning">Disabled</span>}
                  {href && (
                    <a
                      className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Source
                      <ExternalLink size={11} aria-hidden />
                    </a>
                  )}
                </div>
                {a.description && <div className="mt-0.5 text-muted-foreground">{a.description}</div>}
              </div>
              <Tip content={a.off ? 'Enable' : 'Disable'} side="top">
                <span className="mt-0.5 inline-flex">
                  <Switch
                    size="sm"
                    aria-label={`Enable ${a.id}`}
                    checked={!a.off}
                    onCheckedChange={(on) => set(a.id, { off: !on })}
                  />
                </span>
              </Tip>
              <Tip content="Remove" side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${a.id}`}
                  onClick={() => onChange(approvals.filter((p) => p.id !== a.id))}
                >
                  <Trash2 />
                </Button>
              </Tip>
            </li>
          );
        })}
      </ul>
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
