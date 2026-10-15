import { describe, expect, it } from 'vitest';
import {
  bodyLost,
  bodyText,
  editOf,
  newRule,
  parseHeaders,
  parsePaused,
  parseRules,
  resumeArgs,
  ruleFromRow,
  ruleJson,
} from './mocks';
import { Store } from './store';
import { vmEvent } from './testing';

const paused = (fields: Record<string, unknown>) =>
  parsePaused(
    vmEvent('http.paused', {
      id: 3,
      stage: 'request',
      method: 'POST',
      url: 'https://example.com/a',
      headers: { 'content-type': 'application/json' },
      body: '{"n":1}',
      editable: true,
      json: true,
      timeoutMs: 300_000,
      ts: 1000,
      ...fields,
    } as never),
  );

describe('rules', () => {
  it('send only the fields of their mode', () => {
    expect(ruleJson(newRule({ id: 'a', url: '*', mode: 'fail', message: 'down' }))).toEqual({
      id: 'a',
      on: true,
      method: null,
      url: '*',
      mode: 'fail',
      delayMs: 0,
      message: 'down',
    });
  });

  it('round-trip through the app shape', () => {
    const rule = newRule({ id: 'b', url: '*/x', mode: 'pause', request: false, response: true });
    expect(parseRules({ rules: [ruleJson(rule)] })).toEqual([rule]);
  });

  it('skip entries without a url', () => {
    expect(parseRules({ rules: [{ id: 'x' }, 'y', { url: '*' }] })).toHaveLength(1);
    expect(parseRules(undefined)).toEqual([]);
  });

  it('come from a captured call', () => {
    const store = new Store();
    store.add([
      vmEvent('http.request', { id: 1, method: 'GET', url: 'https://example.com/items?p=1' }),
      vmEvent('http.response', {
        id: 1,
        status: 404,
        headers: { 'content-type': ['application/json'], 'content-length': '12' },
        body: { error: 'gone' },
      }),
    ]);
    const row = store.httpRows[0]!;
    expect(ruleFromRow(row)).toMatchObject({
      method: 'GET',
      url: 'https://example.com/items?p=1',
      mode: 'respond',
      status: 404,
      headers: { 'content-type': 'application/json' },
      body: '{\n  "error": "gone"\n}',
    });
    expect(bodyLost(row)).toBe(false);
  });

  it('leave out bodies that did not come whole', () => {
    expect(bodyText('<120 bytes>')).toBe('');
    expect(bodyText({ 'devpul.truncated': { size: 9 } })).toBe('');
    expect(bodyText('plain')).toBe('plain');
    expect(bodyText(null)).toBe('');
  });
});

describe('headers text', () => {
  it('reads name: value lines', () => {
    expect(parseHeaders('a: 1\n\nnot a header\nb:  x: y \n: none')).toEqual({ a: '1', b: 'x: y' });
  });
});

describe('resume args', () => {
  it('carry only what changed', () => {
    const p = paused({});
    expect(resumeArgs(p, editOf(p))).toEqual({ id: 3 });
    expect(resumeArgs(p, { ...editOf(p), method: 'put', body: '{"n":2}' })).toEqual({
      id: 3,
      method: 'PUT',
      body: '{"n":2}',
    });
    expect(resumeArgs(p, { ...editOf(p), headers: 'x-a: 1' })).toEqual({ id: 3, headers: { 'x-a': '1' } });
  });

  it('check the URL, JSON and status', () => {
    const p = paused({});
    expect(resumeArgs(p, { ...editOf(p), url: 'nope' })).toBe('The URL is not valid.');
    expect(resumeArgs(p, { ...editOf(p), body: '{' })).toBe('The body is not valid JSON.');
    const r = paused({ stage: 'response', status: 500 });
    expect(resumeArgs(r, { ...editOf(r), status: '200' })).toEqual({ id: 3, status: 200 });
    expect(resumeArgs(r, { ...editOf(r), status: '20' })).toBe('Status is a number from 100 to 599.');
  });

  it('ignore body edits when it is not editable', () => {
    const p = paused({ editable: false, body: '<3 bytes>' });
    expect(resumeArgs(p, { ...editOf(p), body: 'x' })).toEqual({ id: 3 });
  });

  it('count the timeout from the event', () => {
    expect(paused({}).until).toBe(301_000);
  });
});

describe('store', () => {
  it('shows a held call until it is resumed', () => {
    const store = new Store();
    store.add([vmEvent('http.paused', { id: 7, stage: 'request', method: 'POST', url: 'https://example.com/c' })]);
    expect(store.httpRows.map((r) => [r.method, r.url, r.state])).toEqual([
      ['POST', 'https://example.com/c', 'paused'],
    ]);
    store.add([
      vmEvent('http.resumed', { id: 7, how: 'resumed' }),
      vmEvent('http.request', { id: 7, method: 'POST', url: 'https://example.com/d', mock: 'pause' }),
    ]);
    expect(store.httpRows.map((r) => [r.url, r.state, r.mock])).toEqual([
      ['https://example.com/d', 'pending', 'pause'],
    ]);
    store.add([vmEvent('http.paused', { id: 7, stage: 'response', method: 'POST', url: 'https://example.com/d' })]);
    expect(store.httpRows[0]?.state).toBe('paused');
  });

  it('keeps the latest rules per run', () => {
    const store = new Store();
    store.add([vmEvent('http.mocks', { rules: [{ url: '*' }], ts: 1 }), vmEvent('http.mocks', { rules: [], ts: 2 })]);
    const run = [...store.runs.values()][0];
    expect(run?.mocks?.data.rules).toEqual([]);
    expect(store.httpRows).toEqual([]);
    expect(store.other).toEqual([]);
  });
});
