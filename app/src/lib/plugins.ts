import type { DevEvent, JsonObject } from './events';

export interface PluginEvent {
  /** Unique per event; stable across reloads. */
  key: string;
  kind: string;
  data: JsonObject;
  ts: number;
  session: string;
  run: string;
}

export interface PluginContext {
  /** Every event the plugin matches, oldest first. */
  readonly events: PluginEvent[];
  /**
   * Calls a VM service method on the app that sent the event. Service
   * extensions (`ext.*`) get the event's isolateId unless one is given.
   */
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

/** Adds a tab listing the events it matches. */
export interface DevpulPlugin {
  id: string;
  label: string;
  kinds: string[] | ((kind: string) => boolean);
  /** One line shown in the list. Defaults to the kind. */
  summarize?: (event: PluginEvent) => string;
  /** Renders the selected event. May return a cleanup function. */
  render?: (el: HTMLElement, event: PluginEvent, context: PluginContext) => void | (() => void);
}

export interface DevpulApi {
  version: 2;
  register: (plugin: DevpulPlugin) => void;
}

class Registry {
  plugins: readonly DevpulPlugin[] = [];
  private listeners = new Set<() => void>();

  register = (plugin: DevpulPlugin): void => {
    if (!plugin?.id || !plugin.label || !plugin.kinds) return;
    this.plugins = [...this.plugins.filter((p) => p.id !== plugin.id), plugin];
    for (const fn of this.listeners) fn();
  };

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getPlugins = (): readonly DevpulPlugin[] => this.plugins;

  claims(kind: string): boolean {
    return this.plugins.some((p) => matches(p, kind));
  }
}

export const matches = (p: DevpulPlugin, kind: string): boolean =>
  Array.isArray(p.kinds) ? p.kinds.includes(kind) : p.kinds(kind);

export const toPluginEvent = (e: DevEvent): PluginEvent => ({
  key: e.key,
  kind: e.kind,
  data: e.data,
  ts: e.ts,
  session: e.session,
  run: e.run,
});

export const registry = new Registry();

export const api: DevpulApi = { version: 2, register: registry.register };

declare global {
  interface Window {
    devpul?: DevpulApi;
  }
}

/**
 * The module's default export is a plugin, a list of plugins, or a function
 * that receives the API.
 */
export async function loadPlugin(url: string): Promise<void> {
  const mod = (await import(/* @vite-ignore */ url)) as { default?: unknown };
  const value = mod.default;
  if (typeof value === 'function') (value as (a: DevpulApi) => void)(api);
  else if (Array.isArray(value)) value.forEach((p) => registry.register(p as DevpulPlugin));
  else if (value) registry.register(value as DevpulPlugin);
}
