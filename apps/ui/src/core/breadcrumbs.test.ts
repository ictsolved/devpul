import { describe, expect, it } from 'vitest';
import { breadcrumbs, formatOffset } from './breadcrumbs';
import { Store } from './store';
import { vmEvent } from './testing';

function crumbs(events: ReturnType<typeof vmEvent>[], max?: number) {
  const store = new Store();
  store.add(events);
  const error = store.errors[0]!;
  return breadcrumbs(store.all, store.httpRows, error, max);
}

describe('breadcrumbs', () => {
  it('lists routes, logs, events and requests before the error, newest first', () => {
    const list = crumbs([
      vmEvent('app.session', { seq: 1, ts: 1000, name: 'Shop' }),
      vmEvent('route', { seq: 2, ts: 1100, action: 'push', route: '/cart', previous: '/' }),
      vmEvent('http.request', { seq: 3, ts: 1200, id: 1, method: 'GET', url: 'https://example.com/cart' }),
      vmEvent('http.response', { seq: 4, ts: 1300, id: 1, status: 500 }),
      vmEvent('log', { seq: 5, ts: 1400, level: 'warn', message: 'retrying' }),
      vmEvent('cart.updated', { seq: 6, ts: 1500, items: 2 }),
      vmEvent('error', { seq: 7, ts: 2000, type: 'StateError', message: 'boom' }),
      vmEvent('log', { seq: 8, ts: 2100, message: 'after' }),
    ]);
    expect(list.map((c) => [c.kind, c.text, c.offset])).toEqual([
      ['event', 'cart.updated items: 2', 500],
      ['log', 'warn retrying', 600],
      ['request', 'GET 500 https://example.com/cart', 800],
      ['route', 'push /cart', 900],
    ]);
    expect(list[2]!.key).toBe('s1|1');
  });

  it('keeps to the error run and takes events from other sessions by time', () => {
    const list = crumbs([
      vmEvent('log', { session: 'old', seq: 1, ts: 100, message: 'other run' }, { group: 'isolateGroups/2' }),
      vmEvent('log', { session: 'log:isolates/1', seq: 2_000_000, ts: 2000, message: 'developer.log' }),
      vmEvent('log', { session: 's1', seq: 9, ts: 2000, message: 'same ms, after' }),
      vmEvent('error', { session: 's1', seq: 8, ts: 2000, message: 'boom' }),
    ]);
    expect(list.map((c) => c.text)).toEqual(['info developer.log']);
  });

  it('puts each text on one short line', () => {
    const list = crumbs([
      vmEvent('log', { seq: 1, ts: 1, message: `first\n  second ${'x'.repeat(300)}` }),
      vmEvent('error', { seq: 2, ts: 2, message: 'boom' }),
    ]);
    expect(list[0]!.text).toMatch(/^info first second x+$/);
    expect(list[0]!.text).toHaveLength(200);
  });

  it('stops at the limit', () => {
    const logs = Array.from({ length: 50 }, (_, i) => vmEvent('log', { seq: i + 1, ts: i, message: `m${i}` }));
    const list = crumbs([...logs, vmEvent('error', { seq: 100, ts: 100, message: 'boom' })], 5);
    expect(list.map((c) => c.text)).toEqual(['info m49', 'info m48', 'info m47', 'info m46', 'info m45']);
  });
});

it('formats offsets', () => {
  expect([340, 1234, 75_000].map(formatOffset)).toEqual(['-340 ms', '-1.2 s', '-1 min 15 s']);
});
