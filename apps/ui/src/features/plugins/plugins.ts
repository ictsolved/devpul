import type { DevEvent, JsonObject } from '../../core/events';

/** The plugin API this UI implements. */
export const API = 1;

/** Largest plugin source the UI loads, in bytes. */
export const MAX_SOURCE = 512 * 1024;
/** Longest tab label, in characters; the same as a plugin id. */
export const MAX_LABEL = 32;

export interface PluginEvent {
  /** Unique per event; stable across reloads. */
  key: string;
  kind: string;
  data: JsonObject;
  tags: Record<string, string>;
  ts: number;
  session: string;
  run: string;
}

/** Elements in the UI's own style, for plugins that do not bring their own. */
export interface PluginUi {
  /** A collapsible JSON tree. */
  json: (value: unknown) => HTMLElement;
  /** A two-column table; values that are not strings show as JSON. */
  keyValues: (values: Record<string, unknown>) => HTMLElement;
  /** A copy button. */
  copy: (text: string | (() => string), label?: string) => HTMLElement;
}

export interface PluginContext {
  /** Every event the plugin matches, oldest first, current when read. */
  readonly events: PluginEvent[];
  /** Calls [listener] with events that arrive later, oldest first. */
  onEvents: (listener: (events: PluginEvent[]) => void) => () => void;
  /**
   * Calls a VM service method on the app: the one that sent the event in
   * `render`, the latest matching app in `renderTab`. Service extensions
   * (`ext.*`) get its isolate unless `isolateId` is given.
   */
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  ui: PluginUi;
}

type Cleanup = void | (() => void);

export interface DevpulPlugin {
  /** The API version the plugin was written for. */
  api?: number;
  id: string;
  label: string;
  /** SVG markup shown in the tab. */
  icon?: string;
  /** Event kinds the tab takes; they leave the Events tab. */
  kinds?: string[] | ((kind: string) => boolean);
  /** One line in the list. */
  summarize?: (event: PluginEvent) => string;
  /** Fills the detail pane for the selected event. */
  render?: (el: HTMLElement, event: PluginEvent, context: PluginContext) => Cleanup;
  /** Fills the whole tab, in place of the event list. */
  renderTab?: (el: HTMLElement, context: PluginContext) => Cleanup;
}

export interface DevpulApi {
  api: typeof API;
  register: (plugin: DevpulPlugin) => void;
}

export interface Loaded {
  plugin: DevpulPlugin;
  /** Plugin id the app offered, or the URL the plugin came from. */
  origin: string;
}

class Registry {
  plugins: readonly Loaded[] = [];
  private listeners = new Set<() => void>();

  register(plugin: DevpulPlugin, origin: string): void {
    if (typeof plugin?.id !== 'string' || typeof plugin.label !== 'string' || !plugin.label) {
      throw new Error('A plugin needs a string id and label.');
    }
    if (plugin.label.length > MAX_LABEL) {
      throw new Error(`The label of ${plugin.id} has ${plugin.label.length} characters; the limit is ${MAX_LABEL}.`);
    }
    if (plugin.api !== undefined && plugin.api !== API) {
      throw new Error(`${plugin.id} needs plugin API ${String(plugin.api)}; this UI has API ${API}.`);
    }
    this.plugins = [...this.plugins.filter((p) => p.plugin.id !== plugin.id), { plugin, origin }];
    for (const fn of this.listeners) fn();
  }

  /** Drops every plugin [origin] registered. */
  unregister(origin: string): void {
    if (!this.plugins.some((p) => p.origin === origin)) return;
    this.plugins = this.plugins.filter((p) => p.origin !== origin);
    for (const fn of this.listeners) fn();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getPlugins = (): readonly Loaded[] => this.plugins;

  claims(kind: string): boolean {
    return this.plugins.some((p) => matches(p.plugin, kind));
  }
}

export function matches(p: DevpulPlugin, kind: string): boolean {
  try {
    return Array.isArray(p.kinds) ? p.kinds.includes(kind) : (p.kinds?.(kind) ?? false);
  } catch {
    return false;
  }
}

export const toPluginEvent = (e: DevEvent): PluginEvent => ({
  key: e.key,
  kind: e.kind,
  data: e.data,
  tags: e.tags,
  ts: e.ts,
  session: e.session,
  run: e.run,
});

export const registry = new Registry();

/**
 * Runs [source] as an ES module. Its default export is a plugin or a
 * function that receives the API and registers plugins; an `icon` export is
 * the tab icon for those that set none. Registrations after [wanted] turns
 * false are ignored.
 */
export async function loadPlugin(source: string, origin: string, wanted = () => true): Promise<void> {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  let mod: { default?: unknown; icon?: unknown };
  try {
    mod = (await import(/* @vite-ignore */ url)) as typeof mod;
  } finally {
    URL.revokeObjectURL(url);
  }
  // devpul embeds a plugin's icon file as this export.
  const icon = typeof mod.icon === 'string' ? mod.icon : undefined;
  const register = (p: DevpulPlugin) => {
    if (!wanted()) return;
    if (icon !== undefined && typeof p === 'object' && p !== null) p.icon ??= icon;
    registry.register(p, origin);
  };
  const value = mod.default;
  if (typeof value === 'function') (value as (api: DevpulApi) => void)({ api: API, register });
  else register(value as DevpulPlugin);
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
