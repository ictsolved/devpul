import type { DevEvent } from './events';
import { evictable } from './store';

const DB_NAME = 'devpul';
const STORE = 'events';

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/** Keeps events across reloads under the same byte cap as the store, oldest dropped first. */
export class Persist {
  count = 0;
  bytes = 0;
  private queue: DevEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly db: IDBDatabase,
    public maxBytes: number,
  ) {}

  static open(maxBytes: number): Promise<Persist | null> {
    return new Promise((resolve) => {
      try {
        // Version 2: events with the `data` envelope. Older rows are dropped.
        const req = indexedDB.open(DB_NAME, 2);
        req.onupgradeneeded = () => {
          if (req.result.objectStoreNames.contains(STORE)) req.result.deleteObjectStore(STORE);
          const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('n', 'n');
        };
        req.onsuccess = () => resolve(new Persist(req.result, maxBytes));
        req.onerror = () => resolve(null);
        req.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  async load(): Promise<DevEvent[]> {
    const tx = this.db.transaction(STORE, 'readonly');
    const events: DevEvent[] = [];
    let bytes = 0;
    // Past the cap only app events are taken, as eviction leaves them.
    let full = false;
    const req = tx.objectStore(STORE).index('n').openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      const e = cursor.value as DevEvent;
      full ||= events.length > 0 && bytes + e.size > this.maxBytes;
      if (!full || !evictable(e)) {
        events.push(e);
        bytes += e.size;
      }
      cursor.continue();
    };
    await done(tx);
    events.reverse();
    this.count = events.length;
    this.bytes = bytes;
    return events;
  }

  put(events: DevEvent[]): void {
    this.queue.push(...events);
    this.timer ??= setTimeout(() => void this.flush(), 500);
  }

  async clear(): Promise<void> {
    this.queue = [];
    const tx = this.db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    await done(tx);
    this.count = 0;
    this.bytes = 0;
  }

  async delete(events: DevEvent[]): Promise<void> {
    if (!events.length) return;
    const gone = new Set(events.map((e) => e.key));
    const queued = new Set(this.queue.flatMap((e) => (gone.has(e.key) ? [e.key] : [])));
    this.queue = this.queue.filter((e) => !gone.has(e.key));
    const stored = events.filter((e) => !queued.has(e.key));
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const e of stored) store.delete(e.key);
      await done(tx);
      this.count = Math.max(0, this.count - stored.length);
      this.bytes = Math.max(0, this.bytes - stored.reduce((sum, e) => sum + e.size, 0));
    } catch {
      // Removed from memory anyway; stale rows age out.
    }
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const batch = this.queue;
    this.queue = [];
    if (!batch.length) return;
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const e of batch) store.put(e);
      await done(tx);
      this.count += batch.length;
      this.bytes += batch.reduce((sum, e) => sum + e.size, 0);
      if (this.bytes > this.maxBytes) await this.evict();
    } catch {
      // Quota or a closed database; the in-memory view still works.
    }
  }

  private async evict(): Promise<void> {
    const target = this.maxBytes * 0.9;
    const tx = this.db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).index('n').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || this.bytes <= target) return;
      const e = cursor.value as DevEvent;
      if (evictable(e)) {
        this.count--;
        this.bytes -= e.size;
        cursor.delete();
      }
      cursor.continue();
    };
    await done(tx);
  }
}

const SOURCES_DB = 'devpul-plugins';
const SOURCES = 'sources';

const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

/**
 * Approved plugin sources by SHA-256, read into memory on open. A separate
 * database, so opening it never waits on a version change of the events one.
 */
export class SourceCache {
  private constructor(
    private readonly db: IDBDatabase | null,
    private readonly sources: Map<string, string>,
  ) {}

  /** Falls back to memory only when IndexedDB is unavailable. */
  static async open(): Promise<SourceCache> {
    try {
      const req = indexedDB.open(SOURCES_DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(SOURCES);
      const db = await request(req);
      const tx = db.transaction(SOURCES, 'readonly');
      const store = tx.objectStore(SOURCES);
      const [keys, values] = await Promise.all([request(store.getAllKeys()), request(store.getAll())]);
      const sources = new Map<string, string>();
      keys.forEach((k, i) => {
        if (typeof k === 'string' && typeof values[i] === 'string') sources.set(k, values[i]);
      });
      return new SourceCache(db, sources);
    } catch {
      return new SourceCache(null, new Map());
    }
  }

  get(hash: string): string | undefined {
    return this.sources.get(hash);
  }

  has(hash: string): boolean {
    return this.sources.has(hash);
  }

  put(hash: string, source: string): Promise<void> {
    this.sources.set(hash, source);
    return this.write((store) => store.put(source, hash));
  }

  /** Drops every source whose hash is not in [hashes]. */
  keep(hashes: ReadonlySet<string>): Promise<void> {
    const gone = [...this.sources.keys()].filter((h) => !hashes.has(h));
    if (!gone.length) return Promise.resolve();
    for (const h of gone) this.sources.delete(h);
    return this.write((store) => {
      for (const h of gone) store.delete(h);
    });
  }

  private async write(fn: (store: IDBObjectStore) => void): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(SOURCES, 'readwrite');
      fn(tx.objectStore(SOURCES));
      await done(tx);
    } catch {
      // Quota or a closed database; memory still has it for this page.
    }
  }
}
