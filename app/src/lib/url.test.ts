import { describe, expect, it } from 'vitest';
import { connectionLabel, connectParam, hasToken, pastedUrl, toWsUrl } from './url';

describe('toWsUrl', () => {
  it.each([
    ['http://127.0.0.1:41234/AbCd12=/', 'ws://127.0.0.1:41234/AbCd12=/ws'],
    ['http://127.0.0.1:8184/vmVcCARzURk=', 'ws://127.0.0.1:8184/vmVcCARzURk=/ws'],
    ['ws://127.0.0.1:8181/ws', 'ws://127.0.0.1:8181/ws'],
    ['ws://127.0.0.1:41234/AbCd12=/ws', 'ws://127.0.0.1:41234/AbCd12=/ws'],
    ['http://127.0.0.1:8181/', 'ws://127.0.0.1:8181/ws'],
    ['127.0.0.1:8181', 'ws://127.0.0.1:8181/ws'],
    ['localhost:9100/tok=/', 'ws://localhost:9100/tok=/ws'],
    ['  http://127.0.0.1:41234/AbCd12=/  ', 'ws://127.0.0.1:41234/AbCd12=/ws'],
    [
      'http://127.0.0.1:41234/AbCd12=/devtools/?uri=ws://127.0.0.1:41234/AbCd12=/ws',
      'ws://127.0.0.1:41234/AbCd12=/ws',
    ],
    [
      'http://127.0.0.1:9100/?uri=ws%3A%2F%2F127.0.0.1%3A41234%2FAbCd12%3D%2Fws',
      'ws://127.0.0.1:41234/AbCd12=/ws',
    ],
    ['http://127.0.0.1:41234/AbCd12=/devtools/', 'ws://127.0.0.1:41234/AbCd12=/ws'],
  ])('%s', (input, expected) => {
    expect(toWsUrl(input)).toBe(expected);
  });

  it.each(['', '   ', 'hello world', 'ftp://127.0.0.1:21/', 'http://'])('rejects %j', (input) => {
    expect(toWsUrl(input)).toBeNull();
  });
});

describe('connectionLabel', () => {
  it('shows host and a token prefix', () => {
    expect(connectionLabel('ws://127.0.0.1:41234/AbCd12=/ws')).toBe('127.0.0.1:41234 (AbCd...)');
    expect(connectionLabel('ws://127.0.0.1:8181/ws')).toBe('127.0.0.1:8181');
  });
});

describe('hasToken', () => {
  it('tells run URLs from the fixed one', () => {
    expect(hasToken('ws://127.0.0.1:41234/AbCd12=/ws')).toBe(true);
    expect(hasToken('ws://127.0.0.1:8181/ws')).toBe(false);
  });
});

describe('connectParam', () => {
  it('reads an encoded or plain URL from the hash', () => {
    expect(connectParam('#connect=http%3A%2F%2F127.0.0.1%3A41234%2FAbCd12%3D%2F')).toBe('ws://127.0.0.1:41234/AbCd12=/ws');
    expect(connectParam('#connect=ws://127.0.0.1:8181/ws')).toBe('ws://127.0.0.1:8181/ws');
    expect(connectParam('#other')).toBeNull();
    expect(connectParam('#connect=%E0')).toBeNull();
  });
});

describe('pastedUrl', () => {
  it('accepts only a lone URL', () => {
    expect(pastedUrl(' http://127.0.0.1:41234/AbCd12=/\n')).toBe('ws://127.0.0.1:41234/AbCd12=/ws');
    expect(pastedUrl('see http://127.0.0.1:41234/AbCd12=/')).toBeNull();
    expect(pastedUrl('127.0.0.1:8181')).toBeNull();
  });
});
