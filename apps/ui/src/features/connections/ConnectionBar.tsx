import { cn } from 'cn';
import { Globe, Plug, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tip } from '../../components/Tip';
import type { ConnState } from '../../core/rpc';
import { connectionLabel, toWsUrl } from '../../core/url';

const DOT: Record<ConnState['status'], string> = {
  open: 'bg-success',
  connecting: 'bg-warning',
  closed: 'bg-muted-foreground',
};
const HINT = 'max-w-[900px] text-xs text-muted-foreground';
const ERROR = cn(HINT, 'text-destructive');

export interface ConnEntry {
  id: string;
  url: string;
}

interface Props {
  connections: ConnEntry[];
  states: Record<string, ConnState>;
  names: Record<string, string>;
  localOrigin: boolean;
  /** The host passes the connection: no URL field, no remove buttons. */
  managed?: boolean;
  hero?: boolean;
  /** Shown on the right of the connection chips. */
  controls?: ReactNode;
  /** Connections that read dart:io's HTTP profile. */
  profiled: Record<string, boolean>;
  onAdd: (wsUrl: string) => void;
  onRemove: (id: string) => void;
  onProfile: (id: string, on: boolean) => void;
}

export function ConnectionBar(props: Props) {
  const { connections, states, names, localOrigin, managed, hero, controls, profiled, onAdd, onRemove, onProfile } =
    props;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (value: string) => {
    const ws = toWsUrl(value);
    if (!ws) {
      setError('Not a VM service URL. Paste the http://127.0.0.1:PORT/TOKEN=/ line your run prints.');
      return;
    }
    setError(null);
    setText('');
    onAdd(ws);
  };

  // At least one attempt failed and none ever succeeded.
  const stuck = connections.filter((c) => {
    const s = states[c.id];
    return s?.status === 'closed' && !s.everOpened;
  });

  // In the header grid: the URL field between logo and nav, the rows below it running to the right edge.
  const row = hero ? undefined : 'col-[2/-1] max-[860px]:col-span-full';
  const first = 'col-start-2 row-start-1 max-[860px]:col-span-full max-[860px]:row-start-2';
  return (
    <div className={hero ? 'flex w-full flex-col items-center gap-1.5' : 'contents'}>
      {!managed && (
        <form
          className={cn('flex gap-1.5', hero ? 'w-full flex-wrap justify-center' : first)}
          onSubmit={(e) => {
            e.preventDefault();
            add(text);
          }}
        >
          <Input
            type="text"
            className={cn(
              'flex-1 font-mono text-xs',
              hero && 'h-auto flex-[1_1_320px] rounded-lg px-3 py-[9px] text-sm',
            )}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              hero
                ? 'http://127.0.0.1:41234/AbCdEf12=/'
                : 'Paste VM service URL, e.g. http://127.0.0.1:41234/AbCdEf12=/'
            }
            autoFocus={hero}
            aria-label="VM service URL"
            spellCheck={false}
            autoComplete="off"
          />
          <Button type="submit" size="sm" className={cn(hero && 'h-auto rounded-lg px-3.5 py-2 has-[>svg]:px-3.5')}>
            <Plug />
            Connect
          </Button>
        </form>
      )}
      {(connections.length > 0 || controls) && (
        <div className={cn('flex min-w-0 items-center gap-3 max-[560px]:gap-1.5', managed && !hero ? first : row)}>
          {connections.length > 0 && (
            <ul
              className={cn(
                'flex gap-1.5',
                hero ? 'flex-wrap justify-center' : 'min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]',
              )}
              aria-label="Connections"
            >
              {connections.map((c) => {
                const s = states[c.id];
                const status = s?.status ?? 'closed';
                const profile = profiled[c.id] === true;
                return (
                  <li
                    key={c.id}
                    className="inline-flex flex-none items-center gap-1.5 rounded-full border py-px pr-1 pl-[9px] text-xs whitespace-nowrap"
                  >
                    <Tip content={c.url} code>
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn('size-2 flex-none rounded-full', DOT[status])} aria-label={status} />
                        <span>{names[c.id] ?? connectionLabel(c.url)}</span>
                      </span>
                    </Tip>
                    {s?.paused.length ? <span className="text-warning">paused</span> : null}
                    {(s?.httpProfile || profile) && (
                      <Tip
                        content={
                          profile
                            ? "Reading requests from dart:io's HTTP profile. Click to stop."
                            : "HTTP without an adapter: read requests from dart:io's HTTP profile."
                        }
                      >
                        <button
                          type="button"
                          className={cn(
                            'inline-flex cursor-pointer rounded-full p-0.5',
                            profile ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                          )}
                          onClick={() => onProfile(c.id, !profile)}
                          aria-label="HTTP without an adapter"
                          aria-pressed={profile}
                        >
                          <Globe size={12} />
                        </button>
                      </Tip>
                    )}
                    {!managed && (
                      <button
                        type="button"
                        className="inline-flex cursor-pointer rounded-full p-0.5 text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(c.id)}
                        aria-label={`Remove ${c.url}`}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {controls && <div className="ml-auto flex flex-none items-center gap-1.5">{controls}</div>}
        </div>
      )}
      {error && <div className={cn(ERROR, row)}>{error}</div>}
      {connections.map((c) => {
        const side = states[c.id]?.incompatible;
        if (!side) return null;
        const name = names[c.id] ?? connectionLabel(c.url);
        return (
          <div key={c.id} className={cn(ERROR, row)}>
            {side === 'app'
              ? `${name} uses an older devpul package. Update the devpul packages in the app to use this UI.`
              : `${name} uses a newer devpul package than this UI. Reload the page or update the DevPul UI.`}
          </div>
        );
      })}
      {stuck.length > 0 && !managed && (
        <div className={cn(HINT, row)}>
          Waiting for {stuck.map((c) => connectionLabel(c.url)).join(', ')}. The token in the URL changes on every run;
          pasting the new one replaces the old.
          {!localOrigin &&
            ' This page is hosted, so the browser may ask to allow access to apps on this device: allow it, or check the site settings for local network access. Safari blocks this; use the local version.'}
        </div>
      )}
    </div>
  );
}
