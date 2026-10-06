import { describe, expect, it } from 'vitest';
import { connectionLabel, toWsUrl } from './url';

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
