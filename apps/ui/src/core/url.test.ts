import { describe, expect, it } from 'vitest';
import { connectionLabel, connectParam, hasToken, isLoopback, pastedUrl, toWsUrl } from './url';

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
    ['http://127.0.0.1:41234/AbCd12=/devtools/?uri=ws://127.0.0.1:41234/AbCd12=/ws', 'ws://127.0.0.1:41234/AbCd12=/ws'],
    ['http://127.0.0.1:9100/?uri=ws%3A%2F%2F127.0.0.1%3A41234%2FAbCd12%3D%2Fws', 'ws://127.0.0.1:41234/AbCd12=/ws'],
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
    expect(connectParam('#connect=http%3A%2F%2F127.0.0.1%3A41234%2FAbCd12%3D%2F')).toEqual({
      url: 'ws://127.0.0.1:41234/AbCd12=/ws',
      allowed: true,
    });
    expect(connectParam('#connect=ws://127.0.0.1:8181/ws')).toEqual({ url: 'ws://127.0.0.1:8181/ws', allowed: true });
    expect(connectParam('#other')).toBeNull();
    expect(connectParam('#connect=%E0')).toBeNull();
    expect(connectParam('#connect=hello world')).toBeNull();
  });

  it.each([
    'ws://localhost:8181/ws',
    'http://LOCALHOST:8181/tok=/',
    'ws://127.0.0.1:8181/ws',
    'ws://127.1.2.3:8181/ws',
    'ws://127.1:8181/ws',
    'ws://[::1]:8181/ws',
    'ws://[0:0:0:0:0:0:0:1]:8181/ws',
  ])('allows loopback %s', (url) => {
    expect(connectParam(`#connect=${encodeURIComponent(url)}`)?.allowed).toBe(true);
  });

  it.each([
    'ws://example.com/tok=/ws',
    'wss://example.com:443/ws',
    'ws://192.168.1.10:8181/ws',
    'ws://10.0.2.2:8181/ws',
    'ws://0.0.0.0:8181/ws',
    'ws://[::]:8181/ws',
    'ws://[::ffff:127.0.0.1]:8181/ws',
    'ws://localhost.example.com:8181/ws',
    'ws://127.0.0.1.example.com:8181/ws',
    'ws://user@example.com:8181/ws',
    'ws://127.0.0.1@example.com:8181/ws',
  ])('refuses %s', (url) => {
    const param = connectParam(`#connect=${encodeURIComponent(url)}`);
    expect(param?.allowed).toBe(false);
  });
});

describe('isLoopback', () => {
  it('takes URL hostnames', () => {
    expect(['localhost', '127.0.0.1', '127.255.0.9', '[::1]'].filter(isLoopback)).toHaveLength(4);
    expect(['', 'localhost.', 'example.com', '128.0.0.1', '1.127.0.0.1', '::1'].filter(isLoopback)).toEqual([]);
  });
});

describe('pastedUrl', () => {
  it('accepts only a lone URL', () => {
    expect(pastedUrl(' http://127.0.0.1:41234/AbCd12=/\n')).toBe('ws://127.0.0.1:41234/AbCd12=/ws');
    expect(pastedUrl('see http://127.0.0.1:41234/AbCd12=/')).toBeNull();
    expect(pastedUrl('127.0.0.1:8181')).toBeNull();
  });
});
