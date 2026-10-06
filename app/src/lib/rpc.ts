import {
  type DevEvent,
  fromVm,
  type IsolateRef,
  isObject,
  type JsonObject,
  type VmExtensionEvent,
} from './events';

export type ConnStatus = 'connecting' | 'open' | 'closed';

export interface ConnState {
  status: ConnStatus;
  everOpened: boolean;
  since: number;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

const RETRY_MS = 2000;
const BACKLOG = 'ext.devpul.backlog';

export class Connection {
  state: ConnState = { status: 'closed', everOpened: false, since: Date.now() };

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
    this.state = {
      status,
      everOpened: this.state.everOpened || status === 'open',
      since: Date.now(),
    };
    this.onState();
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
        if (isObject(iso)) await this.fetchBacklog(iso as IsolateRef);
      }
    } catch {
      // The live stream still works.
    }
  }

  // DDS keeps only the last 10k Extension events, shared with Flutter's own
  // per-frame events. The app keeps its own buffer of DevPul events.
  private async fetchBacklog(iso: IsolateRef): Promise<void> {
    if (!iso.id) return;
    let result: unknown;
    try {
      result = await this.call(BACKLOG, { isolateId: iso.id });
    } catch {
      return;
    }
    let group = iso.isolateGroupId;
    if (group === undefined) {
      try {
        const full = await this.call('getIsolate', { isolateId: iso.id });
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
      const e = fromVm(raw, this.id, this.nextN());
      if (e) events.push(e);
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
      const e = fromVm(event as VmExtensionEvent, this.id, this.nextN());
      if (e) this.onEvents([e]);
    } else if (
      streamId === 'Isolate' &&
      event.kind === 'ServiceExtensionAdded' &&
      event.extensionRPC === BACKLOG &&
      isObject(event.isolate)
    ) {
      void this.fetchBacklog(event.isolate as IsolateRef);
    }
  }
}
