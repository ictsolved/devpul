import { describe, expect, it } from 'vitest';
import { fromVm } from './events';
import { latestRuns, Store } from './store';
import { vmEvent } from './testing';

const req = (id: number, seq: number, ts: number, extra = {}) =>
  vmEvent('http.request', {
    session: 's1',
    seq,
    ts,
    id,
    method: 'GET',
    url: `https://example.com/${id}`,
    ...extra,
  });
const res = (id: number, seq: number, ts: number, status = 200) =>
  vmEvent('http.response', {
    session: 's1',
    seq,
    ts,
    id,
    method: 'GET',
    url: `https://example.com/${id}`,
    status,
    durationMs: 5,
  });

// Three-digit seq and ts, so every event without pad has the same size.
const custom = (i: number, pad = '') => vmEvent('custom', { session: 's', seq: 100 + i, ts: 100 + i, pad });
const seqs = (store: Store) => store.all.map((e) => e.seq - 100);
const timedLog = (seq: number, ts: number) => vmEvent('log', { session: 's1', seq, ts, message: `m${seq}` });

describe('Store', () => {
  it('lists events by time when older ones arrive later', () => {
    const store = new Store();
    store.add([timedLog(1, 100), timedLog(2, 300)]);
    store.add([timedLog(3, 200), timedLog(4, 300)]);
    expect(store.logs.map((e) => e.seq)).toEqual([4, 2, 3, 1]);
  });

  it('pairs out of order responses and keeps pending rows', () => {
    const store = new Store();
    store.add([req(1, 1, 100), req(2, 2, 101), req(3, 3, 102), res(2, 4, 110), res(1, 5, 120, 404)]);
    const rows = store.httpRows;
    expect(rows.map((r) => r.id)).toEqual(['3', '2', '1']);
    expect(rows.map((r) => r.state)).toEqual(['pending', 'done', 'done']);
    expect(rows[2]?.status).toBe(404);
    expect(rows[1]?.durationMs).toBe(5);
  });

  it('pairs a response that arrives before its request', () => {
    const store = new Store();
    store.add([res(7, 2, 110)]);
    store.add([req(7, 1, 100)]);
    expect(store.httpRows).toHaveLength(1);
    expect(store.httpRows[0]).toMatchObject({ id: '7', state: 'done', ts: 100, url: 'https://example.com/7' });
  });

  it('keeps the same id from different sessions apart', () => {
    const store = new Store();
    store.add([
      req(1, 1, 100),
      vmEvent('http.request', { session: 's2', seq: 1, ts: 105, id: 1, method: 'POST', url: 'https://example.com/x' }),
    ]);
    expect(store.httpRows).toHaveLength(2);
  });

  it('marks errors', () => {
    const store = new Store();
    store.add([
      req(1, 1, 100),
      vmEvent('http.error', { session: 's1', seq: 2, ts: 130, id: 1, errorType: 'connectionError', status: null }),
    ]);
    expect(store.httpRows[0]).toMatchObject({ state: 'error', status: undefined });
  });

  it('drops replayed duplicates', () => {
    const store = new Store();
    const first = store.add([req(1, 1, 100), res(1, 2, 110)]);
    const again = store.add([req(1, 1, 100), res(1, 2, 110)]);
    expect(first).toHaveLength(2);
    expect(again).toHaveLength(0);
    expect(store.size).toBe(2);
  });

  it('returns new row objects only for changed rows', () => {
    const store = new Store();
    store.add([req(1, 1, 100), req(2, 2, 101)]);
    const [two, one] = store.httpRows;
    store.add([res(1, 3, 110)]);
    const [two2, one2] = store.httpRows;
    expect(two2).toBe(two);
    expect(one2).not.toBe(one);
  });

  it('moves a run to the connection that sends a known event again', () => {
    const store = new Store();
    const session = { session: 's', seq: 1, ts: 10, name: 'Shop' };
    store.add([
      vmEvent('app.session', session, { conn: 'old' }),
      vmEvent('log', { session: 's', seq: 2, ts: 11 }, { conn: 'old' }),
    ]);
    expect(store.add([vmEvent('app.session', session, { conn: 'new' })])).toEqual([]);
    expect([...store.runs.values()].map((r) => [r.conn, r.session?.data.name])).toEqual([['new', 'Shop']]);
    expect(store.all.map((e) => e.conn)).toEqual(['new', 'new']);
  });

  it('groups runs by isolate group and picks the latest session', () => {
    const store = new Store();
    store.add([
      vmEvent('app.session', { session: 'a', seq: 1, ts: 10, name: 'demo' }, { group: 'g1' }),
      vmEvent('custom', { session: 'b', seq: 1, ts: 11 }, { group: 'g1', isolate: 'isolates/2' }),
      vmEvent('app.session', { session: 'c', seq: 1, ts: 50, name: 'demo 2' }, { group: 'g2' }),
    ]);
    expect(store.runs.size).toBe(2);
    expect([...store.runs.values()].map((r) => r.kinds)).toEqual([['app.session', 'custom'], ['app.session']]);
    expect(store.latestSession()?.data.name).toBe('demo 2');
  });

  it('collects tags, errors and other events', () => {
    const store = new Store();
    store.add([
      vmEvent('error', { session: 's', seq: 1, ts: 1, message: 'a', tags: { env: 'dev' } }),
      vmEvent('error', { session: 's', seq: 2, ts: 2, message: 'b' }),
      vmEvent('cart.updated', { session: 's', seq: 3, ts: 3, tags: { env: 'qa' } }),
    ]);
    expect(store.errors.map((e) => e.data.message)).toEqual(['b', 'a']);
    expect(store.other.map((e) => e.kind)).toEqual(['cart.updated']);
    expect([...(store.tags.get('env') ?? [])].toSorted()).toEqual(['dev', 'qa']);
  });

  describe('byte cap', () => {
    const size = custom(0).size;

    it('counts the size measured at ingestion', () => {
      const store = new Store();
      const events = [custom(1), custom(2, 'x'.repeat(1000))];
      store.add(events);
      expect(store.bytes).toBe(events[0]!.size + events[1]!.size);
      expect(events[1]!.size - events[0]!.size).toBe(1000);
    });

    it('drops the oldest events down to 90% once over the cap', () => {
      const store = new Store(size * 10);
      store.add(Array.from({ length: 11 }, (_, i) => custom(i)));
      expect(store.size).toBe(9);
      expect(seqs(store)[0]).toBe(2);
      expect(store.bytes).toBe(size * 9);
      expect(store.dropped).toBe(2);
    });

    it('keeps everything under the cap', () => {
      const store = new Store(size * 10);
      store.add(Array.from({ length: 10 }, (_, i) => custom(i)));
      expect(store.size).toBe(10);
      expect(store.dropped).toBe(0);
    });

    it('drops many small events for one large one, and keeps the newest even when it alone is over', () => {
      const store = new Store(size * 10);
      store.add(Array.from({ length: 5 }, (_, i) => custom(i)));
      store.add([custom(5, 'x'.repeat(size * 7))]);
      expect(seqs(store)).toEqual([4, 5]);
      store.add([custom(6, 'x'.repeat(size * 20))]);
      expect(seqs(store)).toEqual([6]);
      expect(store.dropped).toBe(6);
    });

    it('keeps app events past the cap', () => {
      const session = vmEvent('app.session', { session: 's', seq: 99, ts: 99, name: 'demo' });
      const store = new Store(size * 4);
      store.add([session, ...Array.from({ length: 8 }, (_, i) => custom(i))]);
      expect(store.all[0]).toBe(session);
      expect(store.latestSession()).toBe(session);
      expect(store.bytes).toBeLessThanOrEqual(size * 4);
    });

    it('reindexes HTTP rows after eviction', () => {
      const store = new Store(req(1, 1, 100).size * 3);
      store.add([req(1, 1, 100), req(2, 2, 101), req(3, 3, 102), req(4, 4, 103)]);
      expect(store.httpRows.map((r) => r.id)).toEqual(['4', '3']);
    });

    it('applies a lower cap at once', () => {
      const store = new Store(size * 10);
      store.add(Array.from({ length: 8 }, (_, i) => custom(i)));
      store.setMaxBytes(size * 4);
      expect(store.size).toBe(3);
      expect(store.dropped).toBe(5);
    });

    it('frees bytes on remove and resets on clear', () => {
      const store = new Store();
      store.add([custom(1), custom(2)]);
      store.remove((e) => e.seq === 101);
      expect(store.bytes).toBe(size);
      store.clear();
      expect(store.bytes).toBe(0);
      expect(store.dropped).toBe(0);
    });
  });

  it('ignores non devpul events and flags events without data', () => {
    expect(fromVm({ extensionKind: 'Flutter.Frame', extensionData: {} }, 'c', 1)).toBeNull();
    const old = { v: 1, session: 's', seq: 1, ts: 1, message: 'x' };
    expect(fromVm({ extensionKind: 'devpul.log', extensionData: old }, 'c', 1)).toBe('outdated');
    expect(fromVm({ extensionKind: 'devpul.log', extensionData: { data: {} } }, 'c', 1)).toBeNull();
  });
});

describe('Store selection', () => {
  it('keeps one selection per tab', () => {
    const store = new Store();
    store.select('http', 's1|1');
    store.select('errors', 's1|5');
    store.select('logs', 's1|7');
    store.select('logs', null);
    expect(store.selected('http')).toEqual({ key: 's1|1' });
    expect(store.selected('errors')).toEqual({ key: 's1|5' });
    expect(store.selected('logs')).toBeUndefined();
  });

  it('remembers where an item was opened from until another is picked', () => {
    const store = new Store();
    store.select('http', 's1|1', { tab: 'errors', key: 's1|5' });
    expect(store.selected('http')?.from).toEqual({ tab: 'errors', key: 's1|5' });
    store.select('http', 's1|2');
    expect(store.selected('http')?.from).toBeUndefined();
  });

  it('notifies at once and forgets selections on clear', () => {
    const store = new Store();
    let calls = 0;
    store.subscribe(() => calls++);
    store.select('http', 's1|1');
    expect(calls).toBe(1);
    store.clear();
    expect(store.selected('http')).toBeUndefined();
  });
});

const log = (session: string, seq: number) => vmEvent('log', { session, seq, ts: seq });

describe('Store clear', () => {
  it('skips refetched events up to the last seq of each session', () => {
    const store = new Store();
    store.add([log('a', 1), log('a', 2), log('b', 1)]);
    store.clear();
    expect(store.clearedSeqs).toEqual([
      ['a', 2],
      ['b', 1],
    ]);
    const kept = store.sinceClear([log('a', 1), log('a', 2), log('a', 3), log('b', 1), log('c', 1)]);
    expect(kept.map((e) => e.key)).toEqual(['a|3', 'c|1']);
  });

  it('starts from stored marks and keeps the highest seq', () => {
    const store = new Store(undefined, [['a', 5]]);
    expect(store.sinceClear([log('a', 5), log('a', 6)]).map((e) => e.seq)).toEqual([6]);
    store.add([log('a', 6), log('b', 1)]);
    store.clear();
    expect(store.clearedSeqs).toEqual([
      ['a', 6],
      ['b', 1],
    ]);
  });

  it('keeps the latest 100 sessions', () => {
    const store = new Store(undefined, [['old', 1]]);
    store.add(Array.from({ length: 100 }, (_, i) => log(`s${i}`, 1)));
    store.clear();
    expect(store.clearedSeqs).toHaveLength(100);
    expect(store.clearedSeqs[0]).toEqual(['s0', 1]);
  });
});

describe('Store rows', () => {
  it('derives host and response size', () => {
    const store = new Store();
    store.add([
      req(1, 1, 100),
      vmEvent('http.response', { session: 's1', seq: 2, ts: 110, id: 1, status: 200, body: { a: 'é' } }),
      req(2, 3, 120),
      vmEvent('http.response', {
        session: 's1',
        seq: 4,
        ts: 130,
        id: 2,
        status: 200,
        headers: { 'Content-Length': '512' },
        body: 'x',
      }),
      req(3, 5, 140),
      vmEvent('http.response', { session: 's1', seq: 6, ts: 150, id: 3, status: 200, body: '<2048 bytes>' }),
    ]);
    const byId = Object.fromEntries(store.httpRows.map((r) => [r.id, r]));
    expect(byId['1']).toMatchObject({ host: 'example.com', size: 10 });
    expect(byId['2']?.size).toBe(512);
    expect(byId['3']?.size).toBe(2048);
  });

  it('removes events by predicate', () => {
    const store = new Store();
    store.add([
      req(1, 1, 100, { tags: { a: 'x' } }),
      vmEvent('error', { session: 's2', seq: 1, ts: 1 }, { conn: 'c2' }),
    ]);
    expect(store.remove((e) => e.conn === 'c2')).toHaveLength(1);
    expect(store.errors).toHaveLength(0);
    expect(store.httpRows).toHaveLength(1);
  });

  it('lists the newest run of each connection', () => {
    const store = new Store();
    store.add([
      vmEvent('log', { session: 's1', seq: 1, ts: 1 }),
      vmEvent('log', { session: 's2', seq: 1, ts: 5 }),
      vmEvent('log', { session: 's3', seq: 1, ts: 3 }, { conn: 'c2' }),
    ]);
    const latest = latestRuns(store.runs);
    expect(latest.map((r) => [r.conn, r.last])).toEqual([
      ['c1', 5],
      ['c2', 3],
    ]);
  });
});

const sent = (ts: number, extra: Record<string, string> = {}) =>
  vmEvent('http.request', {
    session: 's1',
    seq: ts,
    ts,
    id: ts,
    method: 'GET',
    url: 'https://example.com/a',
    ...extra,
  });

describe('Store profile lookup', () => {
  it('knows adapter requests by isolate, method and URL, up to 30 s before dart:io starts them', () => {
    const store = new Store();
    store.add([sent(1000), sent(2000, { source: 'dart:io' })]);
    expect(store.sentByAdapter('isolates/1', 'GET', 'https://example.com/a', 1000)).toBe(true);
    expect(store.sentByAdapter('isolates/1', 'GET', 'https://example.com/a', 31_000)).toBe(true);
    expect(store.sentByAdapter('isolates/1', 'GET', 'https://example.com/a', 31_001)).toBe(false);
    expect(store.sentByAdapter('isolates/1', 'GET', 'https://example.com/a', 999)).toBe(false);
    expect(store.sentByAdapter('isolates/2', 'GET', 'https://example.com/a', 1000)).toBe(false);
    expect(store.sentByAdapter('isolates/1', 'POST', 'https://example.com/a', 1000)).toBe(false);
    // Not an adapter's.
    expect(store.sentByAdapter('isolates/1', 'GET', 'https://example.com/a', 32_000)).toBe(false);
  });

  it('has seen kept events and those a Clear went past', () => {
    const store = new Store();
    store.add([sent(5)]);
    expect(store.seen('s1', 5)).toBe(true);
    expect(store.seen('s1', 6)).toBe(false);
    store.clear();
    expect(store.seen('s1', 4)).toBe(true);
    expect(store.seen('s1', 6)).toBe(false);
    expect(store.sentByAdapter('isolates/1', 'GET', 'https://example.com/a', 5)).toBe(false);
  });
});
