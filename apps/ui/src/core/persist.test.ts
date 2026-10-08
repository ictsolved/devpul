import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SourceCache } from './persist';

describe('SourceCache', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('keeps sources across opens and drops the ones not kept', async () => {
    const first = await SourceCache.open();
    await first.put('h1', 'export default 1');
    await first.put('h2', 'export default 2');
    expect(first.get('h1')).toBe('export default 1');

    const second = await SourceCache.open();
    expect(second.get('h2')).toBe('export default 2');
    await second.keep(new Set(['h2']));
    expect(second.has('h1')).toBe(false);

    const third = await SourceCache.open();
    expect(third.has('h1')).toBe(false);
    expect(third.get('h2')).toBe('export default 2');
  });

  it('works in memory without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    const cache = await SourceCache.open();
    await cache.put('h1', 'export default 1');
    expect(cache.get('h1')).toBe('export default 1');
  });
});
