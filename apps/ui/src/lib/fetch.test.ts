import { describe, expect, it } from 'vitest';
import { toFetch } from './fetch';
import { Store } from './store';
import { vmEvent } from './testing';

const row = (data: Record<string, unknown>) => {
  const store = new Store();
  store.add([vmEvent('http.request', { session: 's', seq: 1, ts: 1, id: 1, url: 'https://example.com/a', ...data } as never)]);
  return store.httpRows[0]!;
};

describe('toFetch', () => {
  it('writes method, headers and a JSON body', () => {
    expect(
      toFetch(row({ method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '9' }, body: { a: 1 } })),
    ).toBe(
      [
        'fetch("https://example.com/a", {',
        '  method: "POST",',
        '  headers: {',
        '    "content-type": "application/json"',
        '  },',
        '  body: JSON.stringify({',
        '    "a": 1',
        '  }),',
        '});',
      ].join('\n'),
    );
  });

  it('skips bodies it cannot repeat', () => {
    expect(toFetch(row({ method: 'GET', body: 'x' }))).not.toContain('body');
    expect(toFetch(row({ method: 'POST', headers: { 'Content-Type': 'multipart/form-data' }, body: { f: 'a.png' } }))).toContain(
      '// multipart body not included',
    );
    expect(toFetch(row({ method: 'POST', body: { 'devpul.truncated': { size: 9 } } }))).toContain('// body cut');
  });

  it('keeps string and form bodies', () => {
    expect(toFetch(row({ method: 'PUT', body: 'raw' }))).toContain('body: "raw"');
    expect(
      toFetch(row({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: { q: 'a' } })),
    ).toContain('new URLSearchParams(');
  });
});
