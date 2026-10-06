import { Plug, X } from 'lucide-react';
import { useState } from 'react';
import type { ConnState } from '../lib/rpc';
import { connectionLabel, toWsUrl } from '../lib/url';

export interface ConnEntry {
  id: string;
  url: string;
}

interface Props {
  connections: ConnEntry[];
  states: Record<string, ConnState>;
  names: Record<string, string>;
  localOrigin: boolean;
  onAdd: (wsUrl: string) => void;
  onRemove: (id: string) => void;
}

export const FIXED_URL = 'ws://127.0.0.1:8181/ws';

export function ConnectionBar({ connections, states, names, localOrigin, onAdd, onRemove }: Props) {
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

  return (
    <div className="connbar">
      <form
        className="connform"
        onSubmit={(e) => {
          e.preventDefault();
          add(text);
        }}
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste VM service URL, e.g. http://127.0.0.1:41234/AbCdEf12=/"
          aria-label="VM service URL"
          spellCheck={false}
          autoComplete="off"
        />
        <button type="submit" className="btn primary">
          <Plug size={14} />
          Connect
        </button>
        {!connections.some((c) => c.url === FIXED_URL) && (
          <button
            type="button"
            className="btn"
            onClick={() => add(FIXED_URL)}
            data-tip="For apps run with --dds-port=8181 --disable-service-auth-codes"
          >
            Fixed port 8181
          </button>
        )}
      </form>
      {connections.length > 0 && (
        <ul className="conns" aria-label="Connections">
          {connections.map((c) => {
            const s = states[c.id];
            const status = s?.status ?? 'closed';
            return (
              <li key={c.id} className="conn" data-tip={c.url}>
                <span className={`dot ${status}`} aria-label={status} />
                <span>{names[c.id] ?? connectionLabel(c.url)}</span>
                <button
                  type="button"
                  className="x"
                  onClick={() => onRemove(c.id)}
                  aria-label={`Remove ${c.url}`}
                >
                  <X size={12} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <div className="hint err">{error}</div>}
      {stuck.length > 0 && (
        <div className="hint">
          Waiting for {stuck.map((c) => connectionLabel(c.url)).join(', ')}. The token in the
          URL changes on every run, so paste the new one after a restart.
          {!localOrigin &&
            ' This page is hosted, so the browser may ask to allow access to apps on this device: allow it, or check the site settings for local network access. Safari blocks this; use the local version.'}
        </div>
      )}
    </div>
  );
}
