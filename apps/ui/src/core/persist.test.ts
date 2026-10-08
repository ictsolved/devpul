import { IDBDatabase, IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DevEvent } from './events';
import { Persist, SourceCache } from './persist';
import { vmEvent } from './testing';

const MB = 1024 * 1024;

/** Log events that count as [mb] each toward the byte cap and chunking. */
const logs = (count: number, mb: number): DevEvent[] =>
  Array.from({ length: count }, (_, i) => ({ ...vmEvent('log', { message: `m${i}` }), size: mb * MB }));

const flush = (p: Persist) => (p as unknown as { flush(): Promise<void> }).flush();

describe('Persist', () => {
  beforeEach(() => {
    vi.stubGlobal('indexedDB', new IDBFactory());
  });

  it('writes a large batch in chunks of about 1 MB', async () => {
    const p = (await Persist.open(100 * MB))!;
    const tx = vi.spyOn(IDBDatabase.prototype, 'transaction');
    p.put([...logs(4, 0.4), ...logs(1, 3), ...logs(2, 0.1)]);
    await flush(p);
    // 0.4 + 0.4 | 0.4 + 0.4 | 3 | 0.1 + 0.1
    expect(tx.mock.calls.filter(([, mode]) => mode === 'readwrite')).toHaveLength(4);
    expect(p.count).toBe(7);
    expect((await p.load()).length).toBe(7);
  });

  it('keeps cleared and deleted events out while a flush runs', async () => {
    const p = (await Persist.open(100 * MB))!;
    const events = logs(6, 0.6);
    p.put(events);
    const running = flush(p);
    await p.delete([events[5]!]);
    await running;
    expect((await p.load()).map((e) => e.key)).toEqual(events.slice(0, 5).map((e) => e.key));

    p.put(logs(6, 0.6));
    const again = flush(p);
    await p.clear();
    await again;
    expect(await p.load()).toEqual([]);
  });
});

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
