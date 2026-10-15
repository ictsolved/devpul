import { useCallback, useEffect, useRef, useState } from 'react';
import { isObject, type JsonObject } from '../../core/events';
import { MOCKS, type MockRule, parseRules, RESUME, ruleJson, SET_MOCKS } from '../../core/mocks';
import { rpcMessage } from '../../core/rpc';
import type { RunInfo } from '../../core/store';
import { useStored } from '../../lib/storage';
import { CALL } from '../plugins/plugins';
import type { AppCall } from '../plugins/PluginTab';

export interface MockApp {
  run: RunInfo;
  name: string;
  /** Undefined until the app answers. */
  rules?: MockRule[];
}

export interface Mocks {
  apps: MockApp[];
  set: (app: MockApp, rules: MockRule[]) => Promise<void>;
  /** Lets a paused call in [run] go on; the args are `http.resume`'s. */
  resume: (run: string, args: JsonObject) => Promise<void>;
}

const handles = (run: RunInfo, name: string): boolean => {
  const list = run.info?.data.handlers;
  return Array.isArray(list) && list.some((h) => isObject(h) && h.name === name);
};

/**
 * Rules of each live app that takes them. With [keep], rules are saved per
 * app name and sent to a new run of that app that has none.
 */
export function useMocks(opts: { runs: RunInfo[]; name: (run: RunInfo) => string; call: AppCall; keep: boolean }) {
  const { runs, name, call, keep } = opts;
  const [fetched, setFetched] = useState<Record<string, MockRule[]>>({});
  const [saved, setSaved] = useStored<Record<string, JsonObject[]>>('mocks', {});
  const asked = useRef(new Set<string>());
  const seeded = useRef(new Set<string>());

  const request = useCallback(
    async (run: RunInfo, handler: string, args?: JsonObject): Promise<unknown> => {
      if (!run.info) throw new Error('The app is not connected.');
      let result: unknown;
      try {
        result = await call(run.info, CALL, { name: handler, ...(args && { args: JSON.stringify(args) }) });
      } catch (err) {
        throw new Error(rpcMessage(err), { cause: err });
      }
      return isObject(result) ? result.result : undefined;
    },
    [call],
  );

  const apps: MockApp[] = runs
    .filter((r) => handles(r, SET_MOCKS))
    .map((run) => ({
      run,
      name: name(run),
      // The event is newer than any answer: agents change rules too.
      rules: run.mocks ? parseRules(run.mocks.data) : fetched[run.run],
    }));
  const appKey = apps.map((a) => `${a.run.run}:${a.rules ? JSON.stringify(a.rules.map(ruleJson)) : '?'}`).join('|');

  const set = useCallback(
    async (app: MockApp, rules: MockRule[]) => {
      const result = await request(app.run, SET_MOCKS, { rules: rules.map(ruleJson) });
      setFetched((f) => ({ ...f, [app.run.run]: parseRules(isObject(result) ? result : undefined) }));
    },
    [request],
  );

  const resume = useCallback(
    async (run: string, args: JsonObject) => {
      const info = runs.find((r) => r.run === run);
      if (!info) throw new Error('The app is not connected.');
      await request(info, RESUME, args);
    },
    [runs, request],
  );

  useEffect(() => {
    for (const app of apps) {
      const run = app.run;
      if (app.rules || asked.current.has(run.run)) continue;
      asked.current.add(run.run);
      request(run, MOCKS).then(
        (result) => setFetched((f) => ({ ...f, [run.run]: parseRules(isObject(result) ? result : undefined) })),
        () => asked.current.delete(run.run),
      );
    }
    let next = saved;
    for (const app of apps) {
      if (!app.rules) continue;
      const rules = app.rules.map(ruleJson);
      const kept = saved[app.name];
      if (!seeded.current.has(app.run.run)) {
        seeded.current.add(app.run.run);
        if (keep && !rules.length && kept?.length) {
          void set(app, parseRules({ rules: kept })).catch(() => {});
          continue;
        }
      }
      if (keep && JSON.stringify(kept ?? []) !== JSON.stringify(rules)) next = { ...next, [app.name]: rules };
    }
    if (next !== saved) setSaved(next);
    // Once per change of the apps or their rules; apps is a new array on every render.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey, keep]);

  useEffect(() => {
    if (!keep && Object.keys(saved).length) setSaved({});
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [keep]);

  return { apps, set, resume } satisfies Mocks;
}
