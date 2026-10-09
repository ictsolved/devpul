import { isObject } from './events';

/** A plugin `registry.json` lists, at its latest version. */
export interface RegistryPlugin {
  id: string;
  version: string;
  /** Matches the handshake `origin` of a plugin installed from it. */
  url: string;
  path?: string;
}

/** `registry.json`, format 1. Entries without an id, version and url are skipped. */
export function parseRegistry(data: unknown): RegistryPlugin[] {
  if (!isObject(data) || data.format !== 1 || !Array.isArray(data.plugins)) {
    throw new Error('registry.json is not format 1');
  }
  return data.plugins.flatMap((p) =>
    isObject(p) && typeof p.id === 'string' && typeof p.version === 'string' && typeof p.url === 'string'
      ? [{ id: p.id, version: p.version, url: p.url, ...(typeof p.path === 'string' && { path: p.path }) }]
      : [],
  );
}
