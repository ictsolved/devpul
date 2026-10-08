import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { type WebSocket, WebSocketServer } from 'ws';

type JsonObject = Record<string, unknown>;

/** An event as `ext.devpul.backlog` serves it: `data` is the envelope. */
export interface VmEvent {
  kind: string;
  data: JsonObject & { session: string; seq: number; ts: number; data: JsonObject };
}

export interface Call {
  method: string;
  params: JsonObject;
}

export interface VmOptions {
  events?: VmEvent[];
  info?: JsonObject;
  /** Plugin sources by package id, served by `ext.devpul.plugin`. */
  plugins?: Record<string, string>;
}

const contract = (file: string): unknown =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../../contract', file), 'utf8'));

export const fixtureEvents = (): VmEvent[] => [
  ...(contract('events.json') as VmEvent[]),
  ...(contract('flutter.json') as VmEvent[]),
];

/** Offered as `my_plugin`, the package `info.json` lists. */
export const PLUGIN = `export default {
  api: 1,
  id: 'cart',
  label: 'Cart',
  kinds: ['cart.updated'],
  summarize: (e) => e.data.items + ' items',
  render(el, e, context) {
    el.append(context.ui.keyValues({ items: e.data.items, total: e.data.total }));
  },
};
`;

const item = (i: number) => ({ id: i, name: `item ${i}`, tags: ['a', 'b'], price: i * 1.5, active: i % 2 === 0 });

/**
 * Fixture events cycled up to `count` with fresh seq, ts and request ids, then
 * one request whose response body is a JSON array of about `bodyBytes`.
 */
export function loadEvents(count: number, bodyBytes: number): VmEvent[] {
  const all = fixtureEvents();
  const head = all.filter((e) => e.kind.startsWith('devpul.app.'));
  const cycle = all.filter((e) => e.data.session === 's1' && !e.kind.startsWith('devpul.app.'));
  const out = [...head];
  const t0 = head.at(-1)?.data.ts ?? 0;
  const add = (kind: string, data: JsonObject) => {
    const seq = out.length + 1;
    out.push({ kind, data: { v: 1, session: 's1', seq, ts: t0 + seq * 20, data } });
  };
  for (let i = 0; out.length < count - 2; i++) {
    const e = cycle[i % cycle.length]!;
    const data = structuredClone(e.data.data);
    if (typeof data.id === 'number') data.id += 10 * Math.floor(i / cycle.length);
    add(e.kind, data);
  }
  const body = Array.from({ length: Math.ceil(bodyBytes / JSON.stringify(item(100000)).length) }, (_, i) => item(i));
  const big = { id: 'big', method: 'GET', url: 'https://example.com/big' };
  add('devpul.http.request', { ...big, params: {}, headers: {}, body: null });
  add('devpul.http.response', { ...big, status: 200, durationMs: 120, headers: {}, body });
  return out;
}

const GROUP = {
  type: '@IsolateGroup',
  id: 'isolateGroups/1',
  name: 'main.dart',
  number: '1',
  isSystemIsolateGroup: false,
};
const ISOLATE = {
  type: '@Isolate',
  id: 'isolates/1',
  name: 'main',
  number: '1',
  isSystemIsolate: false,
  isolateGroupId: GROUP.id,
};
const EXTENSIONS = ['backlog', 'action', 'plugin', 'limit', 'info'].map((n) => `ext.devpul.${n}`);

class RpcError extends Error {
  readonly code: number;
  readonly data: JsonObject;
  constructor(code: number, message: string, data: JsonObject = {}) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

/**
 * A VM service with one isolate running the app in `contract/`, answering what
 * the UI calls with the message shapes of a real Dart VM.
 */
export class FakeVm {
  readonly url: string;
  readonly calls: Call[] = [];
  readonly events: VmEvent[];
  private info: JsonObject;
  private readonly plugins: Record<string, string>;
  private readonly server: WebSocketServer;
  private readonly streams = new Map<WebSocket, Set<string>>();
  private paused = false;
  // A paused isolate runs service extensions on resume.
  private queued: (() => void)[] = [];

  private constructor(server: WebSocketServer, options: VmOptions) {
    this.server = server;
    this.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/e2eToken=/`;
    this.plugins = options.plugins ?? { my_plugin: PLUGIN };
    this.info = this.hashed(options.info ?? (contract('info.json') as JsonObject));
    this.events = (options.events ?? fixtureEvents()).map((e) =>
      e.kind === 'devpul.app.info' ? { ...e, data: { ...e.data, data: this.hashed(e.data.data) } } : e,
    );
    server.on('connection', (ws) => {
      this.streams.set(ws, new Set());
      ws.on('message', (text) => this.handle(ws, String(text)));
      ws.on('close', () => this.streams.delete(ws));
    });
  }

  // Plugins list the hash of the source served here, as `devpul` does.
  private hashed(info: JsonObject): JsonObject {
    const plugins = Array.isArray(info.plugins) ? (info.plugins as JsonObject[]) : [];
    return {
      ...info,
      plugins: plugins.map((p) => {
        const source = this.plugins[String(p.id)];
        return source === undefined ? p : { ...p, hash: createHash('sha256').update(source).digest('hex') };
      }),
    };
  }

  static async start(options: VmOptions = {}): Promise<FakeVm> {
    const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
    await new Promise((resolve) => server.once('listening', resolve));
    return new FakeVm(server, options);
  }

  async close(): Promise<void> {
    for (const ws of this.streams.keys()) ws.terminate();
    await new Promise((resolve) => this.server.close(resolve));
  }

  callsTo(method: string): JsonObject[] {
    return this.calls.filter((c) => c.method === method).map((c) => c.params);
  }

  /** Posts an event from the app, as `Devpul.emit` would. */
  emit(kind: string, data: JsonObject, session = 's1'): void {
    const last = this.events.filter((e) => e.data.session === session).at(-1);
    const event: VmEvent = {
      kind: `devpul.${kind}`,
      data: { v: 1, session, seq: (last?.data.seq ?? 0) + 1, ts: (last?.data.ts ?? Date.now()) + 1, data },
    };
    this.events.push(event);
    this.notify('Extension', {
      kind: 'Extension',
      extensionKind: event.kind,
      timestamp: event.data.ts,
      extensionData: event.data,
    });
  }

  pause(): void {
    this.paused = true;
    this.notify('Debug', { kind: 'PauseInterrupted', timestamp: Date.now() });
  }

  resume(): void {
    this.paused = false;
    this.notify('Debug', { kind: 'Resume', timestamp: Date.now() });
    for (const run of this.queued.splice(0)) run();
  }

  private notify(streamId: string, event: JsonObject): void {
    const text = JSON.stringify({
      jsonrpc: '2.0',
      method: 'streamNotify',
      params: { streamId, event: { type: 'Event', isolateGroup: GROUP, isolate: ISOLATE, ...event } },
    });
    for (const [ws, streams] of this.streams) if (streams.has(streamId)) ws.send(text);
  }

  private handle(ws: WebSocket, text: string): void {
    const { id, method, params = {} } = JSON.parse(text) as { id: number; method: string; params?: JsonObject };
    this.calls.push({ method, params });
    const answer = () => {
      let reply: JsonObject;
      try {
        reply = { result: this.answer(ws, method, params) };
      } catch (e) {
        const err = e instanceof RpcError ? e : new RpcError(-32000, 'Server error', { details: String(e) });
        reply = {
          error: { code: err.code, message: err.message, data: { ...err.data, request: { id, method, params } } },
        };
      }
      ws.send(JSON.stringify({ jsonrpc: '2.0', ...reply, id }));
    };
    if (this.paused && method.startsWith('ext.')) this.queued.push(answer);
    else answer();
  }

  private answer(ws: WebSocket, method: string, params: JsonObject): unknown {
    if (method.startsWith('ext.') && params.isolateId !== ISOLATE.id) {
      throw new RpcError(-32602, 'Invalid params', { details: `isolateId: ${String(params.isolateId)}` });
    }
    switch (method) {
      case 'getVersion':
        return { type: 'Version', major: 4, minor: 21 };
      case 'streamListen': {
        const streams = this.streams.get(ws)!;
        if (streams.has(String(params.streamId))) throw new RpcError(103, 'Stream already subscribed');
        streams.add(String(params.streamId));
        return { type: 'Success' };
      }
      case 'getVM':
        return { type: 'VM', name: 'vm', isolates: [ISOLATE], isolateGroups: [GROUP] };
      case 'getIsolate':
        return {
          ...ISOLATE,
          type: 'Isolate',
          runnable: true,
          pauseEvent: { type: 'Event', kind: this.paused ? 'PauseInterrupted' : 'Resume', isolate: ISOLATE },
          extensionRPCs: EXTENSIONS,
        };
      case 'ext.devpul.info':
        return this.info;
      case 'ext.devpul.backlog':
        return { events: this.events };
      case 'ext.devpul.plugin': {
        const source = this.plugins[String(params.id)];
        if (source === undefined) throw new Error(`Invalid argument (id): no plugin ${String(params.id)}`);
        return { source };
      }
      case 'ext.devpul.action': {
        const actions = Array.isArray(this.info.actions) ? (this.info.actions as { name: string }[]) : [];
        if (!actions.some((a) => a.name === params.name)) {
          throw new Error(`Invalid argument (name): unknown action: "${String(params.name)}"`);
        }
        return { result: null };
      }
      case 'ext.devpul.limit': {
        const kind = String(params.kind);
        const limits = { ...(this.info.limits as JsonObject) };
        if (typeof params.perSecond === 'string' && params.perSecond) limits[kind] = Number(params.perSecond);
        else delete limits[kind];
        this.info = { ...this.info, limits };
        this.emit('app.info', this.info);
        return this.info;
      }
      default:
        throw new RpcError(-32601, `Unknown method "${method}".`);
    }
  }
}
