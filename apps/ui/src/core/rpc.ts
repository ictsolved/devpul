import {
  type DevEvent,
  fromVm,
  type IsolateRef,
  isObject,
  type JsonObject,
  PROTOCOL,
  type VmExtensionEvent,
} from './events';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export interface ConnState {
  status: ConnStatus;
  everOpened: boolean;
  /** `app`: the app's devpul package is too old for this UI. `ui`: the reverse. */
  incompatible?: 'app' | 'ui';
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const RETRY_MS = 2000;
const BACKLOG = 'ext.devpul.backlog';
const INFO = 'ext.devpul.info';

export class Connection {
  state: ConnState = { status: 'closed', everOpened: false };

  private ws: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private retry: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(
    readonly id: string,
    readonly url: string,
    private readonly onEvents: (events: DevEvent[]) => void,
    private readonly onState: () => void,
    private readonly nextN: () => number,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    if (this.retry) clearTimeout(this.retry);
    this.retry = null;
    this.ws?.close();
    this.ws = null;
  }

  /** Calls a VM service method. Service extensions need an `isolateId`. */
  call(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('not connected'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
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

  private accept(raw: VmExtensionEvent, out: DevEvent[]): void {
    const e = fromVm(raw, this.id, this.nextN());
    if (e === 'outdated') this.incompatible('app');
    else if (e) out.push(e);
  }

  private open(): void {
    this.setStatus('connecting');
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.scheduleRetry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.setStatus('open');
      void this.subscribe();
    };
    ws.onmessage = (m) => this.handle(m.data);
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      for (const p of this.pending.values()) p.reject(new Error('closed'));
      this.pending.clear();
      this.setStatus('closed');
      this.scheduleRetry();
    };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    if (this.state.status !== 'closed') this.setStatus('closed');
    this.retry = setTimeout(() => {
      this.retry = null;
      if (!this.stopped) this.open();
    }, RETRY_MS);
  }

  private async subscribe(): Promise<void> {
    try {
      await this.call('streamListen', { streamId: 'Extension' });
    } catch {
      // Already subscribed.
    }
    try {
      await this.call('streamListen', { streamId: 'Isolate' });
    } catch {
      // Not offered by every debug service.
    }
    try {
      const vm = await this.call('getVM');
      const isolates = isObject(vm) && Array.isArray(vm.isolates) ? vm.isolates : [];
      for (const iso of isolates) {
        if (isObject(iso)) await this.attach(iso as IsolateRef);
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
    } else if (
      streamId === 'Isolate' &&
      event.kind === 'ServiceExtensionAdded' &&
      event.extensionRPC === INFO &&
      isObject(event.isolate)
    ) {
      void this.attach(event.isolate as IsolateRef);
    }
  }
}
