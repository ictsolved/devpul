import { isObject, type Json, type JsonObject, str } from './events';

export type ParamType = 'text' | 'number' | 'flag' | 'choice';

export interface ActionParam {
  name: string;
  type: ParamType;
  initial: Json;
  options: string[];
}

export interface ActionInfo {
  name: string;
  params: ActionParam[];
}

export interface PluginInfo {
  id: string;
  version?: string;
}

/** `app.info` data, the same as the `ext.devpul.info` handshake. */
export interface AppInfo {
  protocol: number;
  version: string;
  capabilities: string[];
  actions: ActionInfo[];
  plugins: PluginInfo[];
  limits: Record<string, number>;
  dropped: Record<string, number>;
}

const TYPES = new Set<string>(['text', 'number', 'flag', 'choice']);

const list = (v: Json | undefined): Json[] => (Array.isArray(v) ? v : []);

function numbers(v: Json | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (isObject(v)) for (const [k, n] of Object.entries(v)) if (typeof n === 'number') out[k] = n;
  return out;
}

export function parseInfo(data: JsonObject): AppInfo {
  return {
    protocol: typeof data.protocol === 'number' ? data.protocol : 0,
    version: str(data.version) ?? '',
    capabilities: list(data.capabilities).filter((c) => typeof c === 'string'),
    actions: list(data.actions).flatMap((a) => {
      if (!isObject(a) || typeof a.name !== 'string') return [];
      const params = list(a.params).flatMap((p) =>
        isObject(p) && typeof p.name === 'string' && typeof p.type === 'string' && TYPES.has(p.type)
          ? [
              {
                name: p.name,
                type: p.type as ParamType,
                initial: p.initial ?? null,
                options: list(p.options).filter((o) => typeof o === 'string'),
              },
            ]
          : [],
      );
      return [{ name: a.name, params }];
    }),
    plugins: list(data.plugins).flatMap((p) =>
      isObject(p) && typeof p.id === 'string' ? [{ id: p.id, version: str(p.version) }] : [],
    ),
    limits: numbers(data.limits),
    dropped: numbers(data.dropped),
  };
}
