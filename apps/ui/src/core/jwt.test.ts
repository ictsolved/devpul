import { describe, expect, it } from 'vitest';
import { bearerJwt, decodeJwt, expiry } from './jwt';

const b64url = (v: unknown) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(v))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const HEADER = { alg: 'HS256', typ: 'JWT' };
const CLAIMS = { sub: 'user-1', name: 'Zoë ~?>', exp: 1_760_000_000, roles: ['admin'] };
const TOKEN = `${b64url(HEADER)}.${b64url(CLAIMS)}.c2lnbmF0dXJl`;

describe('decodeJwt', () => {
  it('decodes header and claims, UTF-8 and base64url included', () => {
    expect(decodeJwt(TOKEN)).toEqual({ token: TOKEN, header: HEADER, claims: CLAIMS });
  });

  it('accepts an empty signature', () => {
    expect(decodeJwt(`${b64url({ alg: 'none' })}.${b64url({ sub: 'a' })}.`)?.claims).toEqual({ sub: 'a' });
  });

  it.each([
    ['***'],
    ['abc.def'],
    [`${b64url(HEADER)}.${b64url(CLAIMS)}.sig.extra.parts`],
    [`${b64url(HEADER)}.not-json.sig`],
    [`${b64url(HEADER)}.${b64url([1, 2])}.sig`],
    [`.${b64url(CLAIMS)}.sig`],
    [`${b64url(HEADER)}.%%%.sig`],
  ])('rejects %s', (token) => {
    expect(decodeJwt(token)).toBeUndefined();
  });
});

describe('bearerJwt', () => {
  it('reads the header in any case, scheme included', () => {
    expect(bearerJwt({ Authorization: `Bearer ${TOKEN}` })?.claims).toEqual(CLAIMS);
    expect(bearerJwt({ authorization: `bearer  ${TOKEN} ` })?.claims).toEqual(CLAIMS);
  });

  it('reads repeated values', () => {
    expect(bearerJwt({ authorization: ['Basic dTpw', `Bearer ${TOKEN}`] })?.claims).toEqual(CLAIMS);
  });

  it.each([
    [undefined],
    [{}],
    [{ authorization: 'Bearer ***' }],
    [{ authorization: `Basic ${TOKEN}` }],
    [{ authorization: TOKEN }],
    [{ 'x-token': `Bearer ${TOKEN}` }],
  ])('ignores %j', (headers) => {
    expect(bearerJwt(headers)).toBeUndefined();
  });
});

describe('expiry', () => {
  const sent = 1_760_000_000_000;
  it.each([
    [sent / 1000 + 30, 'expires 30 s after the request'],
    [sent / 1000 + 3599, 'expires 59 min after the request'],
    [sent / 1000 + 3600, 'expires 1 h after the request'],
    [sent / 1000 + 7200, 'expires 2 h after the request'],
    [sent / 1000 + 30 * 86400, 'expires 30 d after the request'],
    [sent / 1000, 'expired 0 s before the request'],
    [sent / 1000 - 300, 'expired 5 min before the request'],
  ])('exp %d', (exp, text) => {
    expect(expiry({ exp }, sent)).toBe(text);
  });

  it('needs a numeric exp', () => {
    expect(expiry({}, sent)).toBeUndefined();
    expect(expiry({ exp: '1760000000' }, sent)).toBeUndefined();
  });
});
