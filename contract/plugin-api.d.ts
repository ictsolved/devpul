// DevPul plugin API 1. Types may grow, never change: tsc holds the UI's plugin types to these
// (apps/ui/src/features/plugins/authoring.ts). A change that cannot pass there bumps api.

/** An event the app sent with Devpul.emit. */
export interface PluginEvent {
  /** Unique per event, stable across reloads. */
  key: string;
  kind: string;
  /** The fields the app sent. */
  data: Record<string, any>;
  tags: Record<string, string>;
  /** Milliseconds since the epoch. */
  ts: number;
  session: string;
  /** One launch or hot restart of one app. */
  run: string;
}

/** An HTTP call that an event the plugin matches started. */
export interface PluginRequest {
  key: string;
  /** Key of the event that started it. */
  event: string;
  method: string;
  url: string;
  /** Set once the response arrives. */
  status?: number;
  state: 'pending' | 'paused' | 'done' | 'error';
  /** Milliseconds since the epoch. */
  ts: number;
}

/** Elements in the UI's own style. */
export interface PluginUi {
  /** A collapsible JSON tree. */
  json: (value: unknown) => HTMLElement;
  /** A two-column table; values that are not strings show as JSON. */
  keyValues: (values: Record<string, unknown>) => HTMLElement;
  /** A copy button. A function for `text` is read on click. */
  copy: (text: string | (() => string), label?: string) => HTMLElement;
}

export interface PluginContext {
  /** Every event the plugin matches, oldest first, current when read. */
  readonly events: PluginEvent[];
  /**
   * Calls `listener` with each batch of new matching events, oldest first.
   * Returns a function that stops it; DevPul also stops it on cleanup.
   */
  onEvents: (listener: (events: PluginEvent[]) => void) => () => void;
  /**
   * Calls a VM service method on the app. Service extensions (`ext.*`) get its isolate unless
   * `isolateId` is given. Fails while the app is paused in the debugger and after 5 s without an answer.
   */
  call: (method: string, params?: Record<string, unknown>) => Promise<any>;
  /**
   * Calls a handler the app registered with `Devpul.handle`, on the same app as `call`, and
   * resolves to its result. Rejects with the app's message, such as a `writes` handler refusing
   * while Allow writes is off.
   */
  request: (name: string, args?: Record<string, unknown>) => Promise<any>;
  /** Whether Allow writes is on. The user sets it in the Plugins tab; it is off on each load. */
  readonly writes: boolean;
  /**
   * Calls `listener` when Allow writes changes. Returns a function that stops it; DevPul also
   * stops it on cleanup.
   */
  onWritesChange: (listener: (writes: boolean) => void) => () => void;
  /**
   * The HTTP calls that events the plugin matches started, oldest first, current when read.
   * DevPul 1.0 has no `requests`, `onRequests` or `openRequest`; check before use.
   */
  readonly requests?: PluginRequest[];
  /**
   * Calls `listener` with each batch of calls that are new or changed, oldest first. Returns a
   * function that stops it; DevPul also stops it on cleanup.
   */
  onRequests?: (listener: (requests: PluginRequest[]) => void) => () => void;
  /** Opens a call from `requests` in the HTTP tab; Back returns to the plugin. */
  openRequest?: (key: string) => void;
  ui: PluginUi;
}

/** Nothing, or a function DevPul calls when the view goes away. */
export type Cleanup = void | (() => void);

export interface DevpulPlugin {
  /** The plugin API the module is written for. */
  api: 1;
  /** Unique. Registering the same id again replaces the plugin. */
  id: string;
  /** Tab name. */
  label: string;
  /** SVG markup for the tab; `stroke="currentColor"` follows the theme. Defaults to the icon file. */
  icon?: string;
  /** Event kinds the tab takes; they leave the Events tab. */
  kinds?: string[] | ((kind: string) => boolean);
  /** One line in the list. */
  summarize?: (event: PluginEvent) => string;
  /** Fills `el` for the selected event. Without it the detail shows the event as JSON. */
  render?: (el: HTMLElement, event: PluginEvent, context: PluginContext) => Cleanup;
  /** Fills the whole tab in place of the event list. */
  renderTab?: (el: HTMLElement, context: PluginContext) => Cleanup;
}

/** What a default export function receives, to register several plugins. */
export interface DevpulApi {
  api: 1;
  register: (plugin: DevpulPlugin) => void;
}
