import type { DevEvent } from './events';

const DB_NAME = 'devpul';
const STORE = 'events';
const MAX_BYTES = 200 * 1024 * 1024;

const done = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

/** Keeps events across reloads, oldest dropped first. */
export class Persist {
  count = 0;
  bytes = 0;
  private queue: DevEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  private constructor(
    private readonly db: IDBDatabase,
    public maxEvents: number,
  ) {}

  static open(maxEvents: number): Promise<Persist | null> {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const store = req.result.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('n', 'n');
        };
        req.onsuccess = () => resolve(new Persist(req.result, maxEvents));
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
    const req = tx.objectStore(STORE).index('n').openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || events.length >= this.maxEvents) return;
      events.push(cursor.value as DevEvent);
      cursor.continue();
    };
    await done(tx);
    events.reverse();
    this.count = events.length;
    this.bytes = events.reduce((sum, e) => sum + e.size, 0);
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

  async delete(keys: string[]): Promise<void> {
    if (!keys.length) return;
    const gone = new Set(keys);
    this.queue = this.queue.filter((e) => !gone.has(e.key));
    try {
      const tx = this.db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const key of keys) store.delete(key);
      await done(tx);
      this.count = Math.max(0, this.count - keys.length);
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
      if (this.count > this.maxEvents || this.bytes > MAX_BYTES) await this.evict();
    } catch {
      // Quota or a closed database; the in-memory view still works.
    }
  }

  private async evict(): Promise<void> {
    const targetCount = Math.floor(this.maxEvents * 0.9);
    const targetBytes = MAX_BYTES * 0.9;
    const tx = this.db.transaction(STORE, 'readwrite');
    const req = tx.objectStore(STORE).index('n').openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor || (this.count <= targetCount && this.bytes <= targetBytes)) return;
      this.count--;
      this.bytes -= (cursor.value as DevEvent).size;
      cursor.delete();
      cursor.continue();
    };
    await done(tx);
  }
}
