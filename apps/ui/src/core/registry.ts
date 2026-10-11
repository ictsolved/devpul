import { isObject } from './events';
import { compareVersions, isBreaking, parseVersion } from './semver';

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

export type Update =
  | { state: 'current' }
  | { state: 'available'; version: string; command: string }
  /** Not in the registry under this id and source, or no semver version. */
  | { state: 'unlisted' };

/** How a plugin, as its app reports it, stands against [registry]. */
export function checkUpdate(
  plugin: { id: string; version?: string; origin?: string },
  registry: readonly RegistryPlugin[],
): Update {
  const entry = registry.find((r) => r.id === plugin.id && r.url === plugin.origin);
  const current = plugin.version === undefined ? undefined : parseVersion(plugin.version);
  const latest = entry && parseVersion(entry.version);
  if (!entry || !current || !latest) return { state: 'unlisted' };
  if (compareVersions(current, latest) >= 0) return { state: 'current' };
  const flag = isBreaking(current, latest) ? ' --major-versions' : '';
  return { state: 'available', version: entry.version, command: `devpul upgrade ${plugin.id}${flag}` };
}

/** A browsable link for an http(s) origin; folders, package names and ssh URLs have none. */
export const sourceHref = (origin: string | undefined): string | undefined =>
  origin && /^https?:\/\//i.test(origin) ? origin.replace(/\.git$/, '') : undefined;
