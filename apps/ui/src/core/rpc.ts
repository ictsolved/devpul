import {
  type DevEvent,
  fromVm,
  type IsolateRef,
  isObject,
  type JsonObject,
  PROTOCOL,
  str,
  type VmExtensionEvent,
} from './events';
import { fromLogging } from './logging';
import { GET_PROFILE, HttpProfiler, type ProfileLookup } from './profile';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export interface ConnState {
  status: ConnStatus;
  everOpened: boolean;
  /** `app`: the app's devpul package is too old for this UI. `ui`: the reverse. */
  incompatible?: 'app' | 'ui';
  /** Isolates stopped in the debugger. */
  paused: string[];
  /** Methods other clients registered, such as `reloadSources` from `flutter run`, by service name. */
  services: Record<string, string>;
  /** Some isolate offers dart:io's HTTP profile. */
  httpProfile: boolean;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timer?: ReturnType<typeof setTimeout>;
}

const RETRY_MS = 2000;
export const CALL_TIMEOUT_MS = 5000;
const BACKLOG = 'ext.devpul.backlog';
const INFO = 'ext.devpul.info';

export const isPaused = (state: ConnState | undefined, isolateId: string | undefined): boolean =>
  isolateId !== undefined && state?.paused.includes(isolateId) === true;

/** The text of a failed call: an extension's own message, or the RPC error's. */
export function rpcMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return String(err);
  const data = 'data' in err ? err.data : undefined;
  if (data && typeof data === 'object' && 'details' in data) return String(data.details);
  return 'message' in err ? String(err.message) : String(err);
}

export class Connection {
  state: ConnState = { status: 'closed', everOpened: false, paused: [], services: {}, httpProfile: false };

  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private retrying = false;
  private paused = new Set<string>();
  // Isolates whose handshake or backlog a pause cut off; attached again on resume.
  private reattach = new Set<string>();
  // The run of each isolate's DevPul events, for Logging records on web, where isolates have no group.
  private runs = new Map<string, string>();
  private readonly profiler: HttpProfiler;

  constructor(
    readonly id: string,
    readonly url: string,
    private readonly onEvents: (events: DevEvent[]) => void,
    private readonly onState: () => void,
    private readonly nextN: () => number,
    lookup?: ProfileLookup,
  ) {
    this.profiler = new HttpProfiler(
      (method, params) => this.call(method, params),
      onEvents,
      { conn: id, run: (iso) => this.runOf(iso), n: nextN },
      lookup,
    );
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.profiler.release();
    this.ws?.close();
    this.ws = null;
  }

  /**
   * Calls a VM service method. Service extensions need an `isolateId`; a paused
   * isolate would run them on resume, so they are refused while it is paused.
   */
  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'));
    }
    const ext = method.startsWith('ext.');
    if (ext && typeof params.isolateId === 'string' && this.paused.has(params.isolateId)) {
      return Promise.reject(new Error('The app is paused in the debugger.'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = ext
        ? setTimeout(() => {
            this.pending.delete(id);
            reject(new Error(`No answer from the app within ${CALL_TIMEOUT_MS / 1000} s.`));
          }, CALL_TIMEOUT_MS)
        : undefined;
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
  }

  /** Reads requests from dart:io's HTTP profile, for apps with no adapter. */
  setHttpProfile(on: boolean): void {
    this.profiler.setOn(on);
  }

  /** Calls a method another client registered, on the first isolate. */
  async callService(service: string): Promise<unknown> {
    const method = this.state.services[service];
    if (!method) throw new Error(`${service} is not available.`);
    const vm = await this.call('getVM');
    const iso = isObject(vm) && Array.isArray(vm.isolates) ? vm.isolates.find(isObject) : undefined;
    return this.call(method, { isolateId: iso?.id });
  }

  private setStatus(status: ConnStatus): void {
    this.state = { ...this.state, status, everOpened: this.state.everOpened || status === 'open' };
    this.onState();
  }

  private incompatible(side: 'app' | 'ui'): void {
    if (this.state.incompatible === side) return;
    this.state = { ...this.state, incompatible: side };
    this.onState();
  }

  private setPaused(isolateId: string, paused: boolean): void {
    if (this.paused.has(isolateId) === paused) return;
    if (paused) this.paused.add(isolateId);
    else this.paused.delete(isolateId);
    this.state = { ...this.state, paused: [...this.paused] };
    this.onState();
  }

  private service(event: JsonObject): void {
    const { kind, service, method } = event;
    if (typeof service !== 'string') return;
    const services = { ...this.state.services };
    if (kind === 'ServiceRegistered' && typeof method === 'string') services[service] = method;
    else if (kind === 'ServiceUnregistered') delete services[service];
    else return;
    this.state = { ...this.state, services };
    this.onState();
  }

  private debugEvent(iso: IsolateRef, kind: unknown): void {
    if (!iso.id || typeof kind !== 'string') return;
    if (kind.startsWith('Pause')) {
      this.setPaused(iso.id, true);
    } else if (kind === 'Resume') {
      this.setPaused(iso.id, false);
      if (this.reattach.delete(iso.id)) void this.attach(iso);
    }
  }

  private accept(raw: VmExtensionEvent, out: DevEvent[]): void {
    const e = fromVm(raw, this.id, this.nextN());
    if (e === 'outdated') {
      this.incompatible('app');
    } else if (e) {
      if (e.isolateId) this.runs.set(e.isolateId, e.run);
      out.push(e);
    }
  }

  // The isolate group's run on native; on web that of the isolate's DevPul events.
  private runOf(iso: IsolateRef, group = iso.isolateGroupId): string {
    const known = iso.id ? this.runs.get(iso.id) : undefined;
    return group ? `${this.id}|${group}` : (known ?? `${this.id}|${iso.id ?? ''}`);
  }

  private log(event: JsonObject): void {
    const iso = isObject(event.isolate) ? (event.isolate as IsolateRef) : {};
    const group = (isObject(event.isolateGroup) && str(event.isolateGroup.id)) || iso.isolateGroupId;
    const e = fromLogging(event, { conn: this.id, run: this.runOf(iso, group), n: this.nextN() });
    if (e) this.onEvents([e]);
  }

  private offersProfile(iso: IsolateRef): void {
    this.profiler.add(iso);
    if (this.state.httpProfile) return;
    this.state = { ...this.state, httpProfile: true };
    this.onState();
  }

  private open(): void {
    // A retry stays closed: switching to connecting every RETRY_MS blinks the chip and the hints.
    if (!this.retrying) this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.retrying = false;
      this.setStatus('open');
      void this.subscribe();
    };
    ws.onmessage = (m) => this.handle(m.data);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('closed'));
      }
      this.pending.clear();
      this.paused.clear();
      this.reattach.clear();
      this.profiler.reset();
      this.state = { ...this.state, paused: [], services: {}, httpProfile: false };
      this.setStatus('closed');
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    this.retrying = true;
    if (this.state.status !== 'closed') this.setStatus('closed');
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.stopped) this.open();
    }, RETRY_MS);
  }

  private async subscribe(): Promise<void> {
    // Names this client in DDS. A plain VM service has no such method.
    void this.call('setClientName', { name: 'DevPul' }).catch(() => {});
    // Subscribing to Service replays the registered services, to Logging DDS's last 10k records.
    for (const streamId of ['Extension', 'Logging', 'Isolate', 'Debug', 'Service']) {
      try {
        await this.call('streamListen', { streamId });
      } catch {
        // Already subscribed, or not offered by this debug service.
      }
    }
    try {
      const vm = await this.call('getVM');
      const isolates = isObject(vm) && Array.isArray(vm.isolates) ? vm.isolates : [];
      for (const iso of isolates) {
        if (!isObject(iso) || typeof iso.id !== 'string') continue;
        let profile = false;
        try {
          const full = await this.call('getIsolate', { isolateId: iso.id });
          if (isObject(full) && isObject(full.pauseEvent)) {
            this.debugEvent({ id: iso.id }, full.pauseEvent.kind);
          }
          profile = isObject(full) && Array.isArray(full.extensionRPCs) && full.extensionRPCs.includes(GET_PROFILE);
        } catch {
          // Taken as running.
        }
        await this.attach(iso as IsolateRef);
        // After the backlog, so requests an adapter sent are known.
        if (profile) this.offersProfile(iso as IsolateRef);
      }
    } catch {
      // The live stream still works.
    }
  }

  /** Handshake, then backlog. Apps register `ext.devpul.info` last. */
  private async attach(iso: IsolateRef): Promise<void> {
    if (!iso.id) return;
    let info: unknown;
    try {
      info = await this.call(INFO, { isolateId: iso.id });
    } catch {
      if (this.paused.has(iso.id)) {
        this.reattach.add(iso.id);
        return;
      }
      // Not a DevPul isolate yet, or one older than the handshake.
      try {
        const full = await this.call('getIsolate', { isolateId: iso.id });
        if (isObject(full) && Array.isArray(full.extensionRPCs) && full.extensionRPCs.includes(BACKLOG)) {
          this.incompatible('app');
        }
      } catch {
        // Gone.
      }
      return;
    }
    const protocol = isObject(info) ? info.protocol : undefined;
    if (protocol !== PROTOCOL) {
      this.incompatible(typeof protocol === 'number' && protocol > PROTOCOL ? 'ui' : 'app');
      return;
    }
    await this.fetchBacklog(iso, iso.id);
  }

  // DDS keeps only the last 10k Extension events, shared with Flutter's own
  // per-frame events. The app keeps its own buffer of DevPul events.
  private async fetchBacklog(iso: IsolateRef, id: string): Promise<void> {
    let result: unknown;
    try {
      result = await this.call(BACKLOG, { isolateId: id });
    } catch {
      if (this.paused.has(id)) this.reattach.add(id);
      return;
    }
    let group = iso.isolateGroupId;
    if (group === undefined) {
      try {
        const full = await this.call('getIsolate', { isolateId: id });
        if (isObject(full) && typeof full.isolateGroupId === 'string') {
          group = full.isolateGroupId;
        }
      } catch {
        // Grouped by session then.
      }
    }
    const list = isObject(result) && Array.isArray(result.events) ? result.events : [];
    const events: DevEvent[] = [];
    for (const item of list) {
      if (!isObject(item) || typeof item.kind !== 'string' || !isObject(item.data)) continue;
      const raw: VmExtensionEvent = {
        extensionKind: item.kind,
        extensionData: item.data,
        isolate: { ...iso, isolateGroupId: group },
        timestamp: typeof item.data.ts === 'number' ? item.data.ts : undefined,
      };
      this.accept(raw, events);
    }
    if (events.length) this.onEvents(events);
  }

  private handle(text: unknown): void {
    if (typeof text !== 'string') return;
    let msg: JsonObject;
    try {
      const parsed: unknown = JSON.parse(text);
      if (!isObject(parsed)) return;
      msg = parsed;
    } catch {
      return;
    }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if ('error' in msg) p.reject(msg.error);
      else p.resolve(msg.result);
      return;
    }
    if (msg.method !== 'streamNotify' || !isObject(msg.params)) return;
    const { streamId, event } = msg.params;
    if (!isObject(event)) return;
    if (streamId === 'Extension') {
      const events: DevEvent[] = [];
      this.accept(event as VmExtensionEvent, events);
      if (events.length) this.onEvents(events);
      return;
    }
    if (streamId === 'Service') {
      this.service(event);
      return;
    }
    if (streamId === 'Logging') {
      this.log(event);
      return;
    }
    if (!isObject(event.isolate) || typeof event.isolate.id !== 'string') return;
    const iso = event.isolate as IsolateRef;
    if (streamId === 'Debug') {
      this.debugEvent(iso, event.kind);
    } else if (streamId === 'Isolate' && event.kind === 'IsolateExit') {
      this.setPaused(event.isolate.id, false);
      this.reattach.delete(event.isolate.id);
      this.runs.delete(event.isolate.id);
      this.profiler.remove(event.isolate.id);
      if (this.state.httpProfile && !this.profiler.offered) {
        this.state = { ...this.state, httpProfile: false };
        this.onState();
      }
    } else if (streamId === 'Isolate' && event.kind === 'ServiceExtensionAdded') {
      if (event.extensionRPC === INFO) void this.attach(iso);
      else if (event.extensionRPC === GET_PROFILE) this.offersProfile(iso);
    }
  }
}
