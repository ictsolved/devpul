import { describe, expect, it } from 'vitest';
import { compare, defaultSort, emptyFilter, filterRows, parseQuery, sortRows } from './filter';
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

describe('parseQuery', () => {
  it('splits include and exclude words', () => {
    expect(parseQuery('  Items -HEALTH page -  ')).toEqual({ include: ['items', 'page'], exclude: ['health'], fields: [] });
  });

  it('reads known keys only', () => {
    expect(parseQuery('status:4xx,5xx -host:cdn http://x', ['status', 'host'])).toEqual({
      include: ['http://x'],
      exclude: [],
      fields: [
        { key: 'status', values: ['4xx', '5xx'], negate: false },
        { key: 'host', values: ['cdn'], negate: true },
      ],
    });
  });
});

describe('compare', () => {
  it('handles operators and units', () => {
    expect(compare(600, '>500')).toBe(true);
    expect(compare(500, '>500')).toBe(false);
    expect(compare(500, '>=500')).toBe(true);
    expect(compare(404, '404')).toBe(true);
    expect(compare(2048, '<=2k')).toBe(true);
    expect(compare(2 * 1024 * 1024, '>1mb')).toBe(true);
    expect(compare(undefined, '>1')).toBe(false);
    expect(compare(1, 'abc')).toBe(false);
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

  it('filters by status chips', () => {
    expect(ids({ statuses: ['2xx'] })).toEqual(['1']);
    expect(ids({ statuses: ['5xx'] })).toEqual(['2']);
    expect(ids({ statuses: ['pending'] })).toEqual(['3']);
    expect(ids({ statuses: ['err'] })).toEqual(['4']);
    expect(ids({ statuses: ['4xx'] })).toEqual([]);
    expect(ids({ statuses: ['5xx', 'err'] })).toEqual(['4', '2']);
  });

  it('filters by query fields', () => {
    expect(ids({ text: 'status:5xx,err' })).toEqual(['4', '2']);
    expect(ids({ text: 'status:>=500' })).toEqual(['2']);
    expect(ids({ text: 'method:get' })).toEqual(['3', '1']);
    expect(ids({ text: '-method:get' })).toEqual(['4', '2']);
    expect(ids({ text: 'host:example.com items' })).toEqual(['4', '1']);
    expect(ids({ text: 'tag:env=qa' })).toEqual(['2']);
    expect(ids({ text: 'tag:env' })).toEqual(['2', '1']);
    expect(ids({ text: 'size:>10' })).toEqual(['1']);
  });

  it('filters by host', () => {
    expect(ids({ hosts: ['example.com'] })).toHaveLength(4);
    expect(ids({ hosts: ['other.com'] })).toEqual([]);
  });

  it('filters by methods and tags', () => {
    expect(ids({ methods: ['GET', 'DELETE'] })).toEqual(['4', '3', '1']);
    expect(ids({ tags: { env: ['qa'] } })).toEqual(['2']);
    expect(ids({ tags: { env: ['qa', 'dev'] } })).toEqual(['2', '1']);
    expect(ids({ tags: { env: [] } })).toHaveLength(4);
  });
});

const sorted = (key: Parameters<typeof sortRows>[1]['key'], desc: boolean) =>
  sortRows(rows(), { key, desc }).map((r) => r.id);

describe('sortRows', () => {
  it('keeps newest first by default', () => {
    expect(sortRows(rows(), defaultSort).map((r) => r.id)).toEqual(['4', '3', '2', '1']);
  });

  it('puts missing values last in both directions', () => {
    expect(sorted('status', true)).toEqual(['2', '1', '4', '3']);
    expect(sorted('status', false)).toEqual(['1', '2', '4', '3']);
  });

  it('compares ids and text naturally', () => {
    expect(sorted('id', false)).toEqual(['1', '2', '3', '4']);
    expect(sorted('method', false)).toEqual(['4', '3', '1', '2']);
  });
});
