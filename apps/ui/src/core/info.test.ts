import { describe, expect, it } from 'vitest';
import { limitKey, limitParams, parseInfo } from './info';

describe('parseInfo', () => {
  it('reads actions, plugins and limits and skips malformed entries', () => {
    const info = parseInfo({
      protocol: 1,
      version: '1.0.0',
      capabilities: ['x', 2],
      actions: [
        { name: 'Ping', params: [] },
        {
          name: 'Seed',
          params: [
            { name: 'env', type: 'choice', initial: 'dev', options: ['dev', 'prod'] },
            { name: 'n', type: 'slider' },
            { type: 'text' },
          ],
        },
        { params: [] },
      ],
      plugins: [{ id: 'routes', version: '1.0.0' }, { id: 'bare' }, {}],
      limits: { frame: 0, route: 'x' },
      dropped: { frame: 12 },
    });
    expect(info).toEqual({
      protocol: 1,
      version: '1.0.0',
      capabilities: ['x'],
      actions: [
        { name: 'Ping', params: [] },
        { name: 'Seed', params: [{ name: 'env', type: 'choice', initial: 'dev', options: ['dev', 'prod'] }] },
      ],
      plugins: [
        { id: 'routes', version: '1.0.0' },
        { id: 'bare', version: undefined },
      ],
      limits: { frame: 0 },
      dropped: { frame: 12 },
    });
  });
});

describe('limits', () => {
  it('matches a kind or its longest dotted parent', () => {
    const limits = { http: 5, 'http.request': 0, cart: 1 };
    expect(limitKey('http.request', limits)).toBe('http.request');
    expect(limitKey('http.response', limits)).toBe('http');
    expect(limitKey('http', limits)).toBe('http');
    expect(limitKey('httpx', limits)).toBeUndefined();
    expect(limitKey('cart.updated.item', limits)).toBe('cart');
  });

  it('sends perSecond as a string and leaves it out to clear', () => {
    expect(limitParams('frame', 0)).toEqual({ kind: 'frame', perSecond: '0' });
    expect(limitParams('route', 20)).toEqual({ kind: 'route', perSecond: '20' });
    expect(limitParams('route', null)).toEqual({ kind: 'route' });
  });
});
