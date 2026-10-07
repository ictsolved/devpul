import { Puzzle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DevEvent } from '../lib/events';
import { parseInfo } from '../lib/info';
import { formatBytes } from '../lib/json';
import { loadPlugin, MAX_SOURCE, sha256 } from '../lib/plugins';
import type { ConnState } from '../lib/rpc';
import type { RunInfo } from '../lib/store';
import type { AppCall } from './PluginTab';

export interface Offer {
  /** `id@sha256`, what an approval covers. */
  key: string;
  id: string;
  version?: string;
  size: number;
  hash: string;
  source: string;
  app: string;
}

interface Options {
  runs: ReadonlyMap<string, RunInfo>;
  states: Record<string, ConnState>;
  approved: string[];
  urls: string[];
  call: AppCall;
  appName: (run: RunInfo) => string;
}

/**
 * Fetches the plugins that live apps offer and loads the approved ones.
 * Approval is per package and source hash, so a changed plugin asks again.
 */
export function usePlugins({ runs, states, approved, urls, call, appName }: Options) {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fetched = useRef(new Set<string>());
  const loaded = useRef(new Set<string>());
  const dismissed = useRef(new Set<string>());
  const latest = useRef(approved);
  useEffect(() => {
    latest.current = approved;
  }, [approved]);

  const fail = useCallback((origin: string, err: unknown) => {
    setErrors((e) => ({ ...e, [origin]: err instanceof Error ? err.message : String(err) }));
  }, []);

  const load = useCallback(
    (source: string, origin: string, once: string) => {
      if (loaded.current.has(once)) return;
      loaded.current.add(once);
      loadPlugin(source, origin).catch((err: unknown) => fail(origin, err));
    },
    [fail],
  );

  useEffect(() => {
    for (const url of urls) {
      if (loaded.current.has(url)) continue;
      fetch(url)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((source) => load(source, url, url))
        .catch((err: unknown) => fail(url, err));
    }
  }, [urls, load, fail]);

  useEffect(() => {
    for (const run of latestRuns(runs)) {
      const info = run.info;
      if (!info || states[run.conn]?.status !== 'open') continue;
      for (const { id, version } of parseInfo(info.data).plugins) {
        const once = `${run.run}|${id}`;
        if (fetched.current.has(once)) continue;
        fetched.current.add(once);
        void fetchOffer(info, id, call).then(
          async (source) => {
            const hash = await sha256(source);
            const offer: Offer = {
              key: `${id}@${hash}`,
              id,
              version,
              size: source.length,
              hash,
              source,
              app: appName(run),
            };
            if (latest.current.includes(offer.key)) load(source, id, hash);
            else if (!dismissed.current.has(offer.key) && !loaded.current.has(hash)) {
              setOffers((list) => (list.some((o) => o.key === offer.key) ? list : [...list, offer]));
            }
          },
          (err: unknown) => fail(id, err),
        );
      }
    }
  }, [runs, states, call, appName, load, fail]);

  const allow = (offer: Offer) => {
    setOffers((list) => list.filter((o) => o.key !== offer.key));
    load(offer.source, offer.id, offer.hash);
  };

  const dismiss = (offer: Offer) => {
    dismissed.current.add(offer.key);
    setOffers((list) => list.filter((o) => o.key !== offer.key));
  };

  return { offers, errors, allow, dismiss };
}

/** The newest run of each connection; earlier ones have exited. */
export function latestRuns(runs: ReadonlyMap<string, RunInfo>): RunInfo[] {
  const best = new Map<string, RunInfo>();
  for (const r of runs.values()) {
    const prev = best.get(r.conn);
    if (!prev || r.last > prev.last) best.set(r.conn, r);
  }
  return [...best.values()];
}

async function fetchOffer(info: DevEvent, id: string, call: AppCall): Promise<string> {
  const result = await call(info, 'ext.devpul.plugin', { id });
  const source = result && typeof result === 'object' ? (result as { source?: unknown }).source : undefined;
  if (typeof source !== 'string') throw new Error('The app sent no plugin source.');
  if (source.length > MAX_SOURCE) {
    throw new Error(`The plugin is ${formatBytes(source.length)}; the limit is ${formatBytes(MAX_SOURCE)}.`);
  }
  return source;
}

interface BarProps {
  offers: Offer[];
  onAllow: (offer: Offer) => void;
  onDismiss: (offer: Offer) => void;
}

export function PluginOffers({ offers, onAllow, onDismiss }: BarProps) {
  return offers.map((o) => (
    <div key={o.key} className="offer" role="alert">
      <Puzzle size={14} />
      <span>
        {o.app} offers the plugin <strong>{o.id}</strong>
        {o.version && ` ${o.version}`} ({formatBytes(o.size)}, sha256 <code>{o.hash.slice(0, 12)}</code>). It runs in
        this page with access to every event from every app.
      </span>
      <button type="button" className="btn small primary" onClick={() => onAllow(o)}>
        Allow
      </button>
      <button type="button" className="btn small" onClick={() => onDismiss(o)}>
        Not now
      </button>
    </div>
  ));
}
