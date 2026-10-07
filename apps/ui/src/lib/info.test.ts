import { describe, expect, it } from 'vitest';
import { parseInfo } from './info';

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
