import { describe, expect, it } from 'vitest';
import { fromSession, toHar, toSession } from './export';
import { Store } from './store';
import { vmEvent } from './testing';

const events = () => [
  vmEvent('http.request', {
    session: 's', seq: 1, ts: 1000, id: 1, method: 'POST', url: 'https://example.com/a?q=1&q=2',
    headers: { 'content-type': 'application/json', accept: ['a', 'b'] }, body: { x: 1 },
  }),
  vmEvent('http.response', {
    session: 's', seq: 2, ts: 1100, id: 1, status: 201, statusMessage: 'Created', durationMs: 100,
    headers: { 'content-type': 'application/json' }, body: { ok: true },
  }),
  vmEvent('http.request', { session: 's', seq: 3, ts: 1200, id: 2, method: 'GET', url: 'https://example.com/b' }),
  vmEvent('http.error', { session: 's', seq: 4, ts: 1300, id: 2, errorType: 'connectionError', message: 'refused' }),
];

describe('toHar', () => {
  it('writes HAR 1.2 entries oldest first', () => {
    const store = new Store();
    store.add(events());
    const har = JSON.parse(toHar(store.httpRows, '1.0.0'));
    expect(har.log.version).toBe('1.2');
    expect(har.log.creator).toEqual({ name: 'DevPul', version: '1.0.0' });
    const [a, b] = har.log.entries;
    expect(a.request.url).toBe('https://example.com/a?q=1&q=2');
    expect(a.request.queryString).toEqual([{ name: 'q', value: '1' }, { name: 'q', value: '2' }]);
    expect(a.request.headers).toEqual([
      { name: 'content-type', value: 'application/json' },
      { name: 'accept', value: 'a' },
      { name: 'accept', value: 'b' },
    ]);
    expect(a.request.postData).toEqual({ mimeType: 'application/json', text: '{"x":1}' });
    expect(a.response).toMatchObject({ status: 201, statusText: 'Created', content: { text: '{"ok":true}', mimeType: 'application/json' } });
    expect(a.time).toBe(100);
    expect(b.response.status).toBe(0);
    expect(b).toMatchObject({ _error: 'connectionError: refused' });
    expect(b.request.postData).toBeUndefined();
  });
});

describe('session files', () => {
  it('round trips events with fresh arrival numbers', () => {
    const original = events();
    let n = 100;
    const back = fromSession(toSession(original), () => ++n);
    expect(back.map((e) => e.key)).toEqual(original.map((e) => e.key));
    expect(back.map((e) => e.n)).toEqual([101, 102, 103, 104]);
    expect(back[0]?.data).toEqual(original[0]?.data);
  });

  it('rejects other files and skips broken events', () => {
    expect(() => fromSession('{"log":{}}', () => 1)).toThrow('Not a DevPul session file.');
    expect(fromSession('{"format":"devpul.session","events":[{"key":1},null]}', () => 1)).toEqual([]);
  });
});
