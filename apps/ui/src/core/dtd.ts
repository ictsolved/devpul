import { isObject } from './events';

const TIMEOUT_MS = 5000;

/** A Dart Tooling Daemon client, opened on the first call and again after it closes. */
export class Dtd {
  private ws: Promise<WebSocket> | null = null;
  private nextId = 1;
  private pending = new Map<number, (msg: Record<string, unknown>) => void>();

  constructor(readonly url: string) {}

  async call(method: string, params: Record<string, unknown>): Promise<unknown> {
    const ws = await this.open();
    const id = this.nextId++;
    const msg = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('No answer from the Dart Tooling Daemon.'));
      }, TIMEOUT_MS);
      this.pending.set(id, (m) => {
        clearTimeout(timer);
        resolve(m);
      });
      ws.send(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    });
    if ('error' in msg) throw msg.error;
    return msg.result;
  }

  private open(): Promise<WebSocket> {
    this.ws ??= new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      ws.onopen = () => resolve(ws);
      ws.onerror = () => reject(new Error('Could not reach the Dart Tooling Daemon.'));
      ws.onclose = () => {
        this.ws = null;
        for (const answer of this.pending.values()) answer({ error: new Error('closed') });
        this.pending.clear();
      };
      ws.onmessage = (m) => {
        let msg: unknown;
        try {
          msg = JSON.parse(String(m.data));
        } catch {
          return;
        }
        if (!isObject(msg) || typeof msg.id !== 'number') return;
        const answer = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        answer?.(msg);
      };
    });
    return this.ws;
  }
}
