import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevEvent, JsonObject } from './events';
import {
  DART_IO,
  endEvent,
  endTime,
  HttpProfiler,
  isHop,
  POLL_MS,
  type ProfileLookup,
  profileBody,
  requestEvent,
} from './profile';
import { Store } from './store';

// Recorded from a real VM by packages/devpul/test/vm_service_test.dart.
interface Fixture {
  logging: JsonObject;
  profile: { timestamp: number; requests: JsonObject[] };
  requests: JsonObject[];
}
const fixture = JSON.parse(
  readFileSync(new URL('../../../../contract/http_profile.json', import.meta.url), 'utf8'),
) as Fixture;
const [items, post, redirected, hop, refused] = fixture.profile.requests as [
  JsonObject,
  JsonObject,
  JsonObject,
  JsonObject,
  JsonObject,
];
const full = (ref: JsonObject) => fixture.requests.find((r) => r.id === ref.id)!;
const ISO = 'isolates/1';
const ids = { conn: 'c1', run: 'c1|isolateGroups/1', isolate: 'main', isolateId: ISO, n: 1 };
const bytes = (text: string) => [...new TextEncoder().encode(text)];

describe('profile entries', () => {
  it('maps a request and its response as the adapters send them', () => {
    const req = requestEvent(items, full(items), ids);
    expect(req).toMatchObject({
      kind: 'http.request',
      session: `profile:${ISO}`,
      seq: items.startTime,
      ts: Math.floor(Number(items.startTime) / 1000),
      run: ids.run,
      isolateId: ISO,
      data: {
        id: '1',
        method: 'GET',
        url: 'http://127.0.0.1:8080/items?page=1',
        params: { page: '1' },
        headers: { 'accept-encoding': 'gzip', host: '127.0.0.1:8080' },
        body: null,
        source: DART_IO,
      },
    });
    const res = endEvent(items, profileBody(full(items).responseBody), ids);
    expect(res).toMatchObject({
      kind: 'http.response',
      seq: endTime(items),
      data: {
        id: '1',
        status: 200,
        statusMessage: 'OK',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: { ok: true },
        source: DART_IO,
      },
    });
    expect(res?.data).not.toHaveProperty('finalUrl');
    expect(res?.data.durationMs).toBe(Math.round((endTime(items)! - Number(items.startTime)) / 1000));
  });

  it('decodes a request body', () => {
    expect(requestEvent(post, full(post), ids).data.body).toEqual({ sku: 'abc-1', qty: 2 });
  });

  it('shows a redirect once, with where it ended', () => {
    expect([items, post, redirected, hop, refused].map(isHop)).toEqual([false, false, false, true, false]);
    expect(endEvent(redirected, null, ids)?.data).toMatchObject({
      url: 'http://127.0.0.1:8080/old',
      finalUrl: 'http://127.0.0.1:8080/items',
      status: 200,
    });
  });

  it('maps a refused connection to an error', () => {
    expect(endEvent(refused, null, ids)).toMatchObject({
      kind: 'http.error',
      seq: refused.endTime,
      data: {
        status: null,
        errorType: 'SocketException',
        message: expect.stringMatching(/^Connection refused/) as unknown,
        body: null,
      },
    });
  });

  it('has no end while the response runs', () => {
    const { endTime: _, ...running } = items.response as JsonObject;
    expect(endEvent({ ...items, response: running }, null, ids)).toBeNull();
  });

  it('reads bodies as text, JSON or a size, and cuts long text', () => {
    expect(profileBody([])).toBeNull();
    expect(profileBody(bytes('plain'))).toBe('plain');
    expect(profileBody(bytes('[1, 2]'))).toEqual([1, 2]);
    expect(profileBody(bytes('{not json'))).toBe('{not json');
    expect(profileBody([0xff, 0xfe, 0x00])).toBe('<3 bytes>');
    const long = profileBody(bytes('x'.repeat(1024 * 1024 + 1)));
    expect(long).toEqual({ 'devpul.truncated': { size: 1024 * 1024 + 1, preview: 'x'.repeat(1024 * 1024) } });
  });
});

interface Call {
  method: string;
  params: Record<string, unknown>;
}

/** An app whose profile returns [refs] on every poll and answers bodies from the fixture. */
function app(refs: () => JsonObject[], logging = false) {
  const calls: Call[] = [];
  let enabled = logging;
  const call = async (method: string, params: Record<string, unknown>): Promise<unknown> => {
    await Promise.resolve();
    calls.push({ method, params });
    expect(params.isolateId).toBe(ISO);
    switch (method) {
      case 'ext.dart.io.httpEnableTimelineLogging':
        if (params.enabled !== undefined) enabled = params.enabled === 'true';
        return { type: 'HttpTimelineLoggingState', enabled };
      case 'ext.dart.io.getHttpProfile':
        return { type: 'HttpProfile', timestamp: 99, requests: refs() };
      case 'ext.dart.io.getHttpProfileRequest':
        return fixture.requests.find((r) => r.id === params.id) ?? {};
      default:
        throw new Error(method);
    }
  };
  return { calls, call, enabled: () => enabled };
}

let profiler: HttpProfiler;
let events: DevEvent[];

function start(vm: ReturnType<typeof app>, lookup?: ProfileLookup): void {
  events = [];
  let n = 0;
  profiler = new HttpProfiler(vm.call, (e) => events.push(...e), { conn: 'c1', run: () => 'r', n: () => ++n }, lookup);
  profiler.add({ id: ISO, name: 'main' });
}

const tick = () => vi.advanceTimersByTimeAsync(POLL_MS);
const rows = () => events.map((e) => `${e.kind} ${String(e.data.method)} ${String(e.data.url)}`);

describe('HttpProfiler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('polls nothing while off', async () => {
    const vm = app(() => fixture.profile.requests);
    start(vm);
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(vm.calls).toEqual([]);
  });

  it('turns logging on, adds what the profile holds once, and sets logging back when off', async () => {
    const vm = app(() => fixture.profile.requests);
    start(vm);
    profiler.setOn(true);
    await tick();
    expect(vm.enabled()).toBe(true);
    expect(rows()).toEqual([
      'http.request GET http://127.0.0.1:8080/items?page=1',
      'http.response GET http://127.0.0.1:8080/items?page=1',
      'http.request POST http://127.0.0.1:8080/items',
      'http.response POST http://127.0.0.1:8080/items',
      'http.request GET http://127.0.0.1:8080/old',
      'http.response GET http://127.0.0.1:8080/old',
      'http.request GET http://127.0.0.1:8081/down',
      'http.error GET http://127.0.0.1:8081/down',
    ]);
    // The redirect's body comes from its hop.
    expect(events[5]?.data.body).toEqual({ ok: true });
    // GET bodies are empty; the error has no body to read.
    const reads = vm.calls.filter((c) => c.method === 'ext.dart.io.getHttpProfileRequest').map((c) => c.params.id);
    expect(reads).toEqual(['1', '2', '4']);

    await tick();
    expect(vm.calls.at(-1)?.params).toEqual({ isolateId: ISO, updatedSince: '99' });
    expect(events).toHaveLength(8);

    profiler.setOn(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(vm.enabled()).toBe(false);
    const count = vm.calls.length;
    await vi.advanceTimersByTimeAsync(POLL_MS * 3);
    expect(vm.calls).toHaveLength(count);
  });

  it('leaves logging on that was on before', async () => {
    const vm = app(() => [], true);
    start(vm);
    profiler.setOn(true);
    await tick();
    profiler.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(vm.calls.filter((c) => c.params.enabled !== undefined)).toEqual([]);
    expect(vm.enabled()).toBe(true);
  });

  it('adds a running request, then its end', async () => {
    const { endTime: _, ...running } = items.response as JsonObject;
    let refs: JsonObject[] = [{ ...items, response: running }];
    const vm = app(() => refs);
    start(vm);
    profiler.setOn(true);
    await tick();
    expect(rows()).toEqual(['http.request GET http://127.0.0.1:8080/items?page=1']);
    refs = [items];
    await tick();
    expect(rows()).toEqual([
      'http.request GET http://127.0.0.1:8080/items?page=1',
      'http.response GET http://127.0.0.1:8080/items?page=1',
    ]);
  });

  it('skips requests an adapter sent and events the store holds', async () => {
    const store = new Store();
    const vm = app(() => fixture.profile.requests);
    const lookup: ProfileLookup = {
      seen: (session, seq) => store.seen(session, seq),
      sentByAdapter: (iso, method, url) => iso === ISO && method === 'POST' && url.endsWith('/items'),
    };
    start(vm, lookup);
    profiler.setOn(true);
    await tick();
    expect(rows()).not.toContain('http.request POST http://127.0.0.1:8080/items');
    store.add(events);
    const reads = vm.calls.filter((c) => c.method === 'ext.dart.io.getHttpProfileRequest').length;

    // A reload polls the whole profile again and reads no body twice.
    profiler.release();
    start(vm, lookup);
    profiler.setOn(true);
    await tick();
    expect(events).toEqual([]);
    expect(vm.calls.filter((c) => c.method === 'ext.dart.io.getHttpProfileRequest')).toHaveLength(reads);
  });

  it('counts a body it does not read', async () => {
    const image = {
      ...items,
      response: {
        ...(items.response as JsonObject),
        headers: { 'content-type': ['image/png'], 'content-length': ['2048'] },
      },
    };
    const vm = app(() => [image]);
    start(vm);
    profiler.setOn(true);
    await tick();
    expect(events[1]?.data.body).toBe('<2048 bytes>');
    expect(vm.calls.some((c) => c.method === 'ext.dart.io.getHttpProfileRequest')).toBe(false);
  });
});
