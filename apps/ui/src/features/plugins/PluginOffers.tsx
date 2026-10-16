import { Puzzle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { type Approval, approvedAndCached, type Listed, toLoad } from '../../core/approvals';
import { type DevEvent, isObject } from '../../core/events';
import { parseInfo } from '../../core/info';
import { sourceHref } from '../../core/registry';
import { formatBytes } from '../../core/json';
import { SourceCache } from '../../core/persist';
import { type ConnState, isPaused } from '../../core/rpc';
import { latestRuns, type RunInfo } from '../../core/store';
import type { AppCall } from './PluginTab';
import { loadPlugin, MAX_SOURCE, registry, sha256 } from './plugins';

export interface Offer {
  /** `id@sha256`. */
  key: string;
  id: string;
  version?: string;
  origin?: string;
  description?: string;
  size: number;
  hash: string;
  app: string;
  /** Not now was clicked: out of the banner, still in the Plugins view. */
  dismissed: boolean;
}

/** What a live run sent for one of its plugins. */
type Fetched = Omit<Offer, 'key' | 'dismissed'>;

interface Options {
  runs: ReadonlyMap<string, RunInfo>;
  states: Record<string, ConnState>;
  approvals: Approval[];
  urls: string[];
  call: AppCall;
  appName: (run: RunInfo) => string;
  onApprove: (approval: Approval) => void;
}

/**
 * Loads the approved plugins that runs list, from the cache, and offers the
 * sources live apps send that no approval covers. Approval is per plugin id and
 * source hash, so a changed plugin asks again.
 */
export function usePlugins({ runs, states, approvals, urls, call, appName, onApprove }: Options) {
  const [cache, setCache] = useState<SourceCache | null>(null);
  const [fetched, setFetched] = useState<Record<string, Fetched>>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const asked = useRef(new Set<string>());
  const sources = useRef(new Map<string, string>());
  // Plugin id to the hash it runs.
  const current = useRef(new Map<string, string>());
  const loadedUrls = useRef(new Set<string>());
  const wantedUrls = useRef(new Set<string>());

  useEffect(() => {
    void SourceCache.open().then(setCache);
  }, []);

  const fail = useCallback((origin: string, err: unknown) => {
    setErrors((e) => ({ ...e, [origin]: err instanceof Error ? err.message : String(err) }));
  }, []);

  // devpul serves a changed plugin file under a new URL.
  useEffect(() => {
    const wanted = new Set(urls);
    wantedUrls.current = wanted;
    const gone = [...loadedUrls.current].filter((url) => !wanted.has(url));
    for (const url of gone) {
      loadedUrls.current.delete(url);
      registry.unregister(url);
    }
    if (gone.length) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !gone.includes(k))));
    for (const url of urls) {
      if (loadedUrls.current.has(url)) continue;
      loadedUrls.current.add(url);
      fetch(url)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((source) => loadPlugin(source, url, () => wantedUrls.current.has(url)))
        .catch((err: unknown) => fail(url, err));
    }
  }, [urls, fail]);

  useEffect(() => {
    if (!cache) return;
    for (const run of latestRuns(runs)) {
      const info = run.info;
      const state = states[run.conn];
      // Asked on resume.
      if (!info || state?.status !== 'open' || isPaused(state, info.isolateId)) continue;
      for (const { id, version, origin, description, hash: reported } of parseInfo(info.data).plugins) {
        const once = `${run.run}|${id}`;
        if (asked.current.has(once) || approvedAndCached(approvals, id, reported, (h) => cache.has(h))) continue;
        asked.current.add(once);
        void fetchOffer(info, id, call).then(
          async (source) => {
            if (source === null) return;
            setErrors((e) => (id in e ? Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)) : e));
            const hash = await sha256(source);
            sources.current.set(hash, source);
            setFetched((f) => ({
              ...f,
              [once]: { id, version, origin, description, size: source.length, hash, app: appName(run) },
            }));
          },
          (err: unknown) => fail(id, err),
        );
      }
    }
  }, [cache, approvals, runs, states, call, appName, fail]);

  const listed = useMemo(
    () =>
      latestRuns(runs).flatMap((run) =>
        run.info
          ? parseInfo(run.info.data).plugins.map(({ id, hash }): Listed => ({
              id,
              hash: fetched[`${run.run}|${id}`]?.hash ?? hash,
            }))
          : [],
      ),
    [runs, fetched],
  );

  useEffect(() => {
    if (!cache) return;
    for (const a of approvals) {
      const source = sources.current.get(a.hash);
      if (source !== undefined && !cache.has(a.hash)) void cache.put(a.hash, source);
    }
    void cache.keep(new Set(approvals.map((a) => a.hash)));

    const want = toLoad(approvals, listed, (hash) => cache.has(hash));
    const running = current.current;
    for (const [id, hash] of running) {
      if (want.get(id) === hash) continue;
      running.delete(id);
      registry.unregister(id);
    }
    for (const [id, hash] of want) {
      const source = cache.get(hash);
      if (running.get(id) === hash || source === undefined) continue;
      running.set(id, hash);
      loadPlugin(source, id, () => running.get(id) === hash).catch((err: unknown) => fail(id, err));
    }
  }, [cache, approvals, listed, fail]);

  const offers: Offer[] = [];
  for (const f of Object.values(fetched)) {
    const key = `${f.id}@${f.hash}`;
    if (offers.some((o) => o.key === key)) continue;
    if (approvals.some((a) => a.id === f.id && a.hash === f.hash)) continue;
    offers.push({ key, ...f, dismissed: dismissed.includes(key) });
  }

  const allow = (offer: Offer) =>
    onApprove({
      id: offer.id,
      hash: offer.hash,
      version: offer.version,
      origin: offer.origin,
      description: offer.description,
    });
  const dismiss = (offer: Offer) => setDismissed((d) => [...d, offer.key]);

  return { offers, errors, allow, dismiss };
}

async function fetchOffer(info: DevEvent, id: string, call: AppCall): Promise<string | null> {
  const result = await call(info, 'ext.devpul.plugin', { id });
  // DDS replays an ended run's handshake; its isolate answers with a Sentinel and the run after it asks again.
  if (isObject(result) && result.type === 'Sentinel') return null;
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

/** One offer at a time unless expanded; each plugin is allowed on its own. */
export function PluginOffers({ offers: all, onAllow, onDismiss }: BarProps) {
  const [expanded, setExpanded] = useState(false);
  const offers = all.filter((o) => !o.dismissed);
  const more = offers.length - 1;
  return (expanded ? offers : offers.slice(0, 1)).map((o, i) => (
    <div
      key={o.key}
      className="flex items-center gap-2.5 border-b bg-secondary px-3 py-1.5 text-xs max-[560px]:flex-wrap"
      role="alert"
    >
      <Puzzle size={14} className="flex-none max-[560px]:hidden" />
      <span className="min-w-0 flex-1 max-[560px]:basis-full">
        <OfferText offer={o} />.
        {i === 0 && ' Allowed plugins run in this page with access to every event from every app.'}
      </span>
      <Button type="button" size="xs" onClick={() => onAllow(o)}>
        Allow
      </Button>
      <Button type="button" variant="outline" size="xs" onClick={() => onDismiss(o)}>
        Not now
      </Button>
      {i === 0 && !expanded && more > 0 && (
        <Button type="button" variant="ghost" size="xs" onClick={() => setExpanded(true)}>
          +{more} more
        </Button>
      )}
    </div>
  ));
}

export function OfferText({ offer: o }: { offer: Offer }) {
  const href = sourceHref(o.origin);
  return (
    <>
      {o.app} offers the plugin{' '}
      {href ? (
        <a className="font-bold text-primary hover:underline" href={href} target="_blank" rel="noopener noreferrer">
          {o.id}
        </a>
      ) : (
        <strong>{o.id}</strong>
      )}
      {o.version && ` ${o.version}`} ({formatBytes(o.size)})
    </>
  );
}

/** The `app.info` event of the latest run that offers plugin [origin]. */
export const offeredBy = (runs: ReadonlyMap<string, RunInfo>, origin: string): DevEvent | undefined =>
  latestRuns(runs).find((r) => r.info && parseInfo(r.info.data).plugins.some((p) => p.id === origin))?.info;
