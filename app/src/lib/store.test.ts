import { describe, expect, it } from 'vitest';
import { fromVm } from './events';
import { Store } from './store';
import { vmEvent } from './testing';

const req = (id: number, seq: number, ts: number, extra = {}) =>
  vmEvent('http.request', { v: 1, session: 's1', seq, ts, id, method: 'GET', url: `https://example.com/${id}`, ...extra });
const res = (id: number, seq: number, ts: number, status = 200) =>
  vmEvent('http.response', { v: 1, session: 's1', seq, ts, id, method: 'GET', url: `https://example.com/${id}`, status, durationMs: 5 });

describe('Store', () => {
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

  it('groups runs by isolate group and picks the latest session', () => {
    const store = new Store();
    store.add([
      vmEvent('app.session', { session: 'a', seq: 1, ts: 10, name: 'demo' }, { group: 'g1' }),
      vmEvent('custom', { session: 'b', seq: 1, ts: 11 }, { group: 'g1', isolate: 'isolates/2' }),
      vmEvent('app.session', { session: 'c', seq: 1, ts: 50, name: 'demo 2' }, { group: 'g2' }),
    ]);
    expect(store.runs.size).toBe(2);
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

  it('evicts the oldest events past the limit', () => {
    const store = new Store(10);
    store.add(Array.from({ length: 12 }, (_, i) => vmEvent('custom', { session: 's', seq: i, ts: i })));
    expect(store.size).toBe(9);
    expect(store.all[0]?.seq).toBe(3);
  });

  it('ignores non devpul events', () => {
    expect(fromVm({ extensionKind: 'Flutter.Frame', extensionData: {} }, 'c', 1)).toBeNull();
  });
});
