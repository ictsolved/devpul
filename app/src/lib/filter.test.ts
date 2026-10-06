import { describe, expect, it } from 'vitest';
import { emptyFilter, filterRows, parseTerms } from './filter';
import { Store } from './store';
import { vmEvent } from './testing';

function rows() {
  const store = new Store();
  store.add([
    vmEvent('http.request', { session: 's', seq: 1, ts: 1, id: 1, method: 'GET', url: 'https://example.com/items?page=1', tags: { env: 'dev' } }),
    vmEvent('http.response', { session: 's', seq: 2, ts: 2, id: 1, status: 200, body: { name: 'Widget' } }),
    vmEvent('http.request', { session: 's', seq: 3, ts: 3, id: 2, method: 'POST', url: 'https://example.com/orders', body: { sku: 'abc-1' }, tags: { env: 'qa' } }),
    vmEvent('http.response', { session: 's', seq: 4, ts: 4, id: 2, status: 503 }),
    vmEvent('http.request', { session: 's', seq: 5, ts: 5, id: 3, method: 'GET', url: 'https://example.com/health' }),
    vmEvent('http.request', { session: 's', seq: 6, ts: 6, id: 4, method: 'DELETE', url: 'https://example.com/items/9' }),
    vmEvent('http.error', { session: 's', seq: 7, ts: 7, id: 4, errorType: 'connectionTimeout', message: 'timed out' }),
  ]);
  return store.httpRows;
}

const ids = (f: Partial<typeof emptyFilter>) => filterRows(rows(), { ...emptyFilter, ...f }).map((r) => r.id);

describe('parseTerms', () => {
  it('splits include and exclude words', () => {
    expect(parseTerms('  Items -HEALTH page -  ')).toEqual({ include: ['items', 'page'], exclude: ['health'] });
  });
});

describe('filterRows', () => {
  it('ANDs words', () => {
    expect(ids({ text: 'items page' })).toEqual(['1']);
  });

  it('excludes with -word', () => {
    expect(ids({ text: 'example -health -orders' })).toEqual(['4', '1']);
  });

  it('matches request and response bodies and ids', () => {
    expect(ids({ text: 'widget' })).toEqual(['1']);
    expect(ids({ text: 'abc-1' })).toEqual(['2']);
    expect(ids({ text: '#3' })).toEqual(['3']);
    expect(ids({ text: 'timed' })).toEqual(['4']);
  });

  it('filters by status chip', () => {
    expect(ids({ status: '2xx' })).toEqual(['1']);
    expect(ids({ status: '5xx' })).toEqual(['2']);
    expect(ids({ status: 'pending' })).toEqual(['3']);
    expect(ids({ status: 'err' })).toEqual(['4']);
    expect(ids({ status: '4xx' })).toEqual([]);
  });

  it('filters by methods and tags', () => {
    expect(ids({ methods: ['GET', 'DELETE'] })).toEqual(['4', '3', '1']);
    expect(ids({ tags: { env: ['qa'] } })).toEqual(['2']);
    expect(ids({ tags: { env: ['qa', 'dev'] } })).toEqual(['2', '1']);
    expect(ids({ tags: { env: [] } })).toHaveLength(4);
  });
});
