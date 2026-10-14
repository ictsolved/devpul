import { describe, expect, it } from 'vitest';
import { childPath, copyValue, decodeAs, decoders, hint } from './decode';
import { formatDateTime } from './json';

const b64url = (v: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(v))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const TOKEN = `${b64url({ alg: 'HS256' })}.${b64url({ sub: 'a', exp: 1_760_000_000 })}.c2ln`;
const AT = Date.UTC(2026, 9, 14, 9, 0, 0);

describe('hint', () => {
  it('marks JWTs and JSON inside strings', () => {
    expect(hint('token', TOKEN)).toEqual({ as: 'jwt' });
    expect(hint(undefined, ' {"a": 1} ')).toEqual({ as: 'json' });
    expect(hint('list', '[1, 2]')).toEqual({ as: 'json' });
  });

  it.each([['{}'], ['[]'], ['{not json}'], ['"quoted"'], ['12'], ['a.b.c'], [`Bearer ${TOKEN}`]])(
    'leaves %s alone',
    (value) => {
      expect(hint('value', value)).toBeUndefined();
    },
  );

  it('reads epoch numbers under time keys, seconds or milliseconds', () => {
    expect(hint('exp', 1_760_000_000)).toEqual({ time: 1_760_000_000_000 });
    expect(hint('created_at', 1_760_000_000_123)).toEqual({ time: 1_760_000_000_123 });
    expect(hint('updatedAt', 1_760_000_000)).toEqual({ time: 1_760_000_000_000 });
  });

  it.each([
    ['count', 1_760_000_000],
    ['format', 1_760_000_000],
    ['exp', 3600],
    ['created_at', '1760000000'],
  ])('reads no time from %s: %s', (key, value) => {
    expect(hint(key, value)).toBeUndefined();
  });

  it('reads HTTP dates and rate limit resets in headers only', () => {
    const date = 'Wed, 14 Oct 2026 09:00:00 GMT';
    expect(hint('Last-Modified', date, { headers: true })).toEqual({ time: AT });
    expect(hint('last-modified', date)).toBeUndefined();
    expect(hint('expires', '0', { headers: true })).toBeUndefined();
    expect(hint('expires', '-1', { headers: true })).toBeUndefined();
    expect(hint('x-ratelimit-reset', '1760000000', { headers: true })).toEqual({ time: 1_760_000_000_000 });
    expect(hint('ratelimit-reset', '30', { headers: true, at: AT })).toEqual({ time: AT + 30_000 });
    expect(hint('ratelimit-reset', '30', { headers: true })).toBeUndefined();
    expect(hint('retry-after', date, { headers: true })).toEqual({ time: AT });
    expect(hint('date', 'soon', { headers: true })).toBeUndefined();
    expect(hint('exp', 1_760_000_000, { headers: true })).toBeUndefined();
  });
});

describe('decodeAs', () => {
  it('decodes Base64 and base64url to UTF-8 text', () => {
    expect(decodeAs('base64', btoa('{"a":1}'))).toEqual({ value: '{"a":1}' });
    expect(decodeAs('base64', b64url('Zoë'))).toEqual({ value: '"Zoë"' });
    expect(decodeAs('base64', 'YWJj\nZGVm')).toEqual({ value: 'abcdef' });
  });

  it.each([['not base64!'], ['abcde'], [''], ['/w==']])('refuses %j as Base64 text', (value) => {
    expect(decodeAs('base64', value)).toHaveProperty('error');
  });

  it('URL decodes', () => {
    expect(decodeAs('url', 'a%20b%2Fc+d')).toEqual({ value: 'a b/c+d' });
    expect(decodeAs('url', '%E0%A4%A')).toEqual({ error: 'Not URL encoded.' });
  });

  it('decodes a JWT, with or without a bearer prefix', () => {
    const value = { claims: { sub: 'a', exp: 1_760_000_000 }, header: { alg: 'HS256' } };
    expect(decodeAs('jwt', TOKEN)).toEqual({ value });
    expect(decodeAs('jwt', `Bearer ${TOKEN}`)).toEqual({ value });
    expect(decodeAs('jwt', 'abc')).toEqual({ error: 'Not a signed JWT.' });
  });

  it('parses JSON strings', () => {
    expect(decodeAs('json', '"x"')).toEqual({ value: 'x' });
    expect(decodeAs('json', '{"a":[1]}')).toEqual({ value: { a: [1] } });
    expect(decodeAs('json', '{')).toEqual({ error: 'Not JSON.' });
    expect(decodeAs('json', 3)).toEqual({ error: 'Not a string.' });
  });

  it('reads times from numbers and date strings', () => {
    expect(decodeAs('time', 1_760_000_000)).toEqual({
      text: `${formatDateTime(1_760_000_000_000)} (Unix seconds)`,
    });
    expect(decodeAs('time', '1760000000123')).toEqual({
      text: `${formatDateTime(1_760_000_000_123)} (Unix milliseconds)`,
    });
    expect(decodeAs('time', '2026-10-14T09:00:00Z')).toEqual({ text: formatDateTime(AT) });
    expect(decodeAs('time', 'later')).toEqual({ error: 'Not a time.' });
    expect(decodeAs('time', 1e20)).toEqual({ error: 'Not a time.' });
  });
});

describe('decoders', () => {
  it('offers decoders by type', () => {
    expect(decoders('x')).toEqual(['base64', 'url', 'jwt', 'json', 'time']);
    expect(decoders(1)).toEqual(['time']);
    expect(decoders(null)).toEqual([]);
    expect(decoders({ a: 1 })).toEqual([]);
  });
});

describe('childPath', () => {
  it('writes JavaScript paths', () => {
    expect(childPath('', 'user', false)).toBe('user');
    expect(childPath('', '0', true)).toBe('[0]');
    expect(childPath('user', 'tokens', false)).toBe('user.tokens');
    expect(childPath('user.tokens', '0', true)).toBe('user.tokens[0]');
    expect(childPath('headers', 'content-type', false)).toBe('headers["content-type"]');
    expect(childPath('', '2fa', false)).toBe('["2fa"]');
  });
});

describe('copyValue', () => {
  it('copies strings as they are and the rest as JSON', () => {
    expect(copyValue('a "b"')).toBe('a "b"');
    expect(copyValue(3)).toBe('3');
    expect(copyValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});
