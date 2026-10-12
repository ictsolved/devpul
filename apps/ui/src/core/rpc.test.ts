import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevEvent } from './events';
import { CALL_TIMEOUT_MS, Connection, isPaused } from './rpc';

interface Sent {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

const ISO = 'isolates/1';

class FakeSocket {
  static readonly OPEN = 1;
  static last: FakeSocket;
  readyState = 0;
  sent: Sent[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  /** Result for a request, or undefined to leave it unanswered. */
  answer: (req: Sent) => unknown = () => undefined;

  constructor(readonly url: string) {
    FakeSocket.last = this;
  }

  send(text: string): void {
    const req = JSON.parse(text) as Sent;
    this.sent.push(req);
    const result = this.answer(req);
    if (result !== undefined) queueMicrotask(() => this.reply(req.id, result));
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }

  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.();
  }

  reply(id: number, result: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', id, result }) });
  }

  notify(streamId: string, event: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify({ jsonrpc: '2.0', method: 'streamNotify', params: { streamId, event } }) });
  }

  methods = (): string[] => this.sent.map((r) => r.method);
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const backlog = {
  events: [{ kind: 'devpul.custom', data: { v: 1, session: 's', seq: 1, ts: 1, data: { a: 1 } } }],
};

/** A VM with one isolate whose pause event is [pause]. */
function vm(pause: string) {
  return (req: Sent): unknown => {
    switch (req.method) {
      case 'setClientName':
      case 'streamListen':
        return {};
      case 'getVM':
        return { isolates: [{ id: ISO, name: 'main', isolateGroupId: 'g1' }] };
      case 'getIsolate':
        return { id: ISO, pauseEvent: { kind: pause }, extensionRPCs: [] };
      case 'ext.devpul.info':
        return { protocol: 1 };
      case 'ext.devpul.backlog':
        return backlog;
      default:
        return undefined;
    }
  };
}

let conn: Connection;
let events: DevEvent[];

async function connect(answer: (req: Sent) => unknown): Promise<FakeSocket> {
  events = [];
  let n = 0;
  conn = new Connection(
    'c1',
    'ws://127.0.0.1:1/ws',
    (e) => events.push(...e),
    () => {},
    () => ++n,
  );
  conn.start();
  const ws = FakeSocket.last;
  ws.answer = answer;
  ws.open();
  await settle();
  return ws;
}

beforeEach(() => {
  vi.stubGlobal('WebSocket', FakeSocket);
});

afterEach(() => {
  conn.stop();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Connection timeout', () => {
  it('fails a service extension call after 5 s and drops it', async () => {
    const ws = await connect(vm('Resume'));
    vi.useFakeTimers();
    const call = conn.call('ext.app.slow', { isolateId: ISO });
    const failed = expect(call).rejects.toThrow('No answer from the app within 5 s.');
    vi.advanceTimersByTime(CALL_TIMEOUT_MS - 1);
    await settle();
    expect((conn as unknown as { pending: Map<number, unknown> }).pending.size).toBe(1);
    vi.advanceTimersByTime(1);
    await failed;
    expect((conn as unknown as { pending: Map<number, unknown> }).pending.size).toBe(0);
    // A late answer is ignored.
    ws.reply(ws.sent.at(-1)?.id ?? 0, {});
  });

  it('leaves other VM service calls without a timeout', async () => {
    const ws = await connect(vm('Resume'));
    vi.useFakeTimers();
    const call = conn.call('getIsolate', { isolateId: 'isolates/2' });
    vi.advanceTimersByTime(CALL_TIMEOUT_MS * 2);
    ws.reply(ws.sent.at(-1)?.id ?? 0, { id: 'isolates/2' });
    await expect(call).resolves.toEqual({ id: 'isolates/2' });
  });

  it('answers within the timeout', async () => {
    await connect((req) => (req.method === 'ext.app.fast' ? { ok: true } : vm('Resume')(req)));
    await expect(conn.call('ext.app.fast', { isolateId: ISO })).resolves.toEqual({ ok: true });
  });
});

describe('Connection pause state', () => {
  it('attaches a running isolate on connect', async () => {
    const ws = await connect(vm('Resume'));
    expect(ws.sent.filter((r) => r.method === 'streamListen').map((r) => r.params.streamId)).toEqual([
      'Extension',
      'Logging',
      'Isolate',
      'Debug',
      'Service',
    ]);
    expect(ws.methods()).toContain('ext.devpul.backlog');
    expect(conn.state.paused).toEqual([]);
    expect(events.map((e) => e.kind)).toEqual(['custom']);
  });

  it('sends no extension calls to an isolate paused on connect, and attaches on resume', async () => {
    const ws = await connect(vm('PauseBreakpoint'));
    expect(conn.state.paused).toEqual([ISO]);
    expect(isPaused(conn.state, ISO)).toBe(true);
    expect(ws.methods().filter((m) => m.startsWith('ext.'))).toEqual([]);
    await expect(conn.call('ext.devpul.action', { isolateId: ISO, name: 'x' })).rejects.toThrow(
      'The app is paused in the debugger.',
    );
    await expect(conn.call('getIsolate', { isolateId: ISO })).resolves.toBeDefined();
    expect(ws.methods().filter((m) => m.startsWith('ext.'))).toEqual([]);

    ws.notify('Debug', { kind: 'Resume', isolate: { id: ISO, name: 'main', isolateGroupId: 'g1' } });
    await settle();
    expect(conn.state.paused).toEqual([]);
    expect(ws.methods().filter((m) => m.startsWith('ext.'))).toEqual(['ext.devpul.info', 'ext.devpul.backlog']);
    expect(events.map((e) => e.kind)).toEqual(['custom']);
  });

  it('follows Pause and Resume from the Debug stream', async () => {
    const states: string[][] = [];
    const ws = await connect(vm('Resume'));
    const before = ws.sent.length;
    for (const kind of ['PauseBreakpoint', 'Resume', 'PauseException', 'Resume']) {
      ws.notify('Debug', { kind, isolate: { id: ISO } });
      states.push(conn.state.paused);
      if (kind !== 'Resume') {
        await expect(conn.call('ext.devpul.limit', { isolateId: ISO })).rejects.toThrow('paused');
      }
    }
    expect(states).toEqual([[ISO], [], [ISO], []]);
    // Attached before the pause, so resume fetches nothing again.
    expect(ws.sent.length).toBe(before);
  });

  it('ignores other Debug events and calls to other isolates', async () => {
    const ws = await connect(vm('Resume'));
    ws.notify('Debug', { kind: 'PauseBreakpoint', isolate: { id: ISO } });
    ws.notify('Debug', { kind: 'BreakpointAdded', isolate: { id: ISO } });
    expect(conn.state.paused).toEqual([ISO]);
    conn.call('ext.app.x', { isolateId: 'isolates/2' }).catch(() => {});
    expect(ws.methods()).toContain('ext.app.x');
  });

  it('attaches again on resume when a pause cut off the handshake', async () => {
    vi.useFakeTimers();
    const ws = await connect((req) => (req.method === 'ext.devpul.info' ? undefined : vm('Resume')(req)));
    ws.notify('Debug', { kind: 'PauseBreakpoint', isolate: { id: ISO } });
    await vi.advanceTimersByTimeAsync(CALL_TIMEOUT_MS);
    expect(events).toEqual([]);
    ws.answer = vm('Resume');
    ws.notify('Debug', { kind: 'Resume', isolate: { id: ISO, isolateGroupId: 'g1' } });
    await settle();
    expect(events.map((e) => e.kind)).toEqual(['custom']);
  });

  it('forgets pause state on exit and on close', async () => {
    const ws = await connect(vm('PauseStart'));
    expect(conn.state.paused).toEqual([ISO]);
    ws.notify('Isolate', { kind: 'IsolateExit', isolate: { id: ISO } });
    expect(conn.state.paused).toEqual([]);
    ws.notify('Debug', { kind: 'PauseBreakpoint', isolate: { id: ISO } });
    expect(conn.state.paused).toEqual([ISO]);
    ws.close();
    expect(conn.state.paused).toEqual([]);
  });
});

const registered = (service: string, method: string) => ({ kind: 'ServiceRegistered', service, method });

describe('Connection services', () => {
  it('tracks registered services and calls them on the first isolate', async () => {
    const ws = await connect((req) => (req.method === 's1.reloadSources' ? { type: 'Success' } : vm('Resume')(req)));
    ws.notify('Service', registered('reloadSources', 's1.reloadSources'));
    ws.notify('Service', registered('hotRestart', 's1.hotRestart'));
    expect(conn.state.services).toEqual({ reloadSources: 's1.reloadSources', hotRestart: 's1.hotRestart' });

    await expect(conn.callService('reloadSources')).resolves.toEqual({ type: 'Success' });
    expect(ws.sent.at(-1)).toMatchObject({ method: 's1.reloadSources', params: { isolateId: ISO } });

    ws.notify('Service', { kind: 'ServiceUnregistered', service: 'hotRestart', method: 's1.hotRestart' });
    expect(conn.state.services).toEqual({ reloadSources: 's1.reloadSources' });
    await expect(conn.callService('hotRestart')).rejects.toThrow('hotRestart is not available.');
  });

  it('forgets services on close', async () => {
    const ws = await connect(vm('Resume'));
    ws.notify('Service', registered('reloadSources', 's1.reloadSources'));
    ws.close();
    expect(conn.state.services).toEqual({});
  });
});

const record = (message: string, time = 5) => ({
  logRecord: { message: { kind: 'String', valueAsString: message }, level: 800, time, sequenceNumber: time },
});

describe('Connection Logging', () => {
  it('adds developer.log records to the run of their isolate group', async () => {
    const ws = await connect(vm('Resume'));
    for (const [message, time] of [
      ['a', 5],
      ['b', 6],
    ] as const) {
      ws.notify('Logging', {
        ...record(message, time),
        isolate: { id: ISO, name: 'main', isolateGroupId: 'g1' },
        isolateGroup: { id: 'g1' },
      });
    }
    const logs = events.filter((e) => e.kind === 'log');
    expect(logs.map((e) => [e.data.message, e.run, e.session, e.ts])).toEqual([
      ['a', 'c1|g1', `log:${ISO}`, 5],
      ['b', 'c1|g1', `log:${ISO}`, 6],
    ]);
    expect(new Set(logs.map((e) => e.key)).size).toBe(2);
  });

  it('takes the run of the isolate DevPul events came from where isolates have no group', async () => {
    const ws = await connect(vm('Resume'));
    // Web: DevPul events of an isolate without a group run by session.
    ws.notify('Extension', {
      extensionKind: 'devpul.custom',
      extensionData: { v: 1, session: 'web', seq: 1, ts: 1, data: {} },
      isolate: { id: 'isolates/2', name: 'main' },
    });
    ws.notify('Logging', { ...record('a'), isolate: { id: 'isolates/2', name: 'main' } });
    ws.notify('Logging', { ...record('b'), isolate: { id: 'isolates/3', name: 'main' } });
    expect(events.filter((e) => e.kind === 'log').map((e) => e.run)).toEqual(['web', 'c1|isolates/3']);
  });

  it('gives a record DDS replays to a new client the key it had', async () => {
    const event = { ...record('a'), isolate: { id: ISO, name: 'main', isolateGroupId: 'g1' } };
    let ws = await connect(vm('Resume'));
    ws.notify('Logging', event);
    const first = events.at(-1)?.key;
    ws.close();
    ws = await connect(vm('Resume'));
    ws.notify('Logging', event);
    expect(events.at(-1)?.key).toBe(first);
  });

  it('names itself to DDS', async () => {
    const ws = await connect(vm('Resume'));
    expect(ws.sent[0]).toMatchObject({ method: 'setClientName', params: { name: 'DevPul' } });
  });
});

describe('Connection HTTP profile', () => {
  const PROFILE = ['ext.dart.io.httpEnableTimelineLogging', 'ext.dart.io.getHttpProfile'];
  /** A native app: its isolate offers dart:io's profile, which holds nothing. */
  const native = (req: Sent): unknown => {
    switch (req.method) {
      case 'getIsolate':
        return { id: ISO, pauseEvent: { kind: 'Resume' }, extensionRPCs: PROFILE };
      case 'ext.dart.io.httpEnableTimelineLogging':
        return { type: 'HttpTimelineLoggingState', enabled: false };
      case 'ext.dart.io.getHttpProfile':
        return { type: 'HttpProfile', timestamp: 1, requests: [] };
      default:
        return vm('Resume')(req);
    }
  };
  const logging = (ws: FakeSocket) =>
    ws.sent.filter((r) => r.method === PROFILE[0] && r.params.enabled !== undefined).map((r) => r.params.enabled);

  it('offers the profile where an isolate has it, and only polls when on', async () => {
    vi.useFakeTimers();
    let ws = await connect(vm('Resume'));
    expect(conn.state.httpProfile).toBe(false);
    conn.stop();

    ws = await connect(native);
    expect(conn.state.httpProfile).toBe(true);
    await vi.advanceTimersByTimeAsync(3000);
    expect(ws.methods()).not.toContain('ext.dart.io.getHttpProfile');

    conn.setHttpProfile(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(ws.methods()).toContain('ext.dart.io.getHttpProfile');
    expect(logging(ws)).toEqual(['true']);

    ws.notify('Isolate', { kind: 'IsolateExit', isolate: { id: ISO } });
    expect(conn.state.httpProfile).toBe(false);
    ws.notify('Isolate', {
      kind: 'ServiceExtensionAdded',
      extensionRPC: PROFILE[1],
      isolate: { id: ISO, name: 'main' },
    });
    expect(conn.state.httpProfile).toBe(true);
  });

  it('sets logging back on stop', async () => {
    vi.useFakeTimers();
    const ws = await connect(native);
    conn.setHttpProfile(true);
    await vi.advanceTimersByTimeAsync(1000);
    conn.stop();
    expect(logging(ws)).toEqual(['true', 'false']);
  });
});
