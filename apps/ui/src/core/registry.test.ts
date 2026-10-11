import { describe, expect, it } from 'vitest';
import { checkUpdate, type RegistryPlugin, sourceHref } from './registry';

const registry: RegistryPlugin[] = [
  { id: 'cart', version: '1.3.0', url: 'https://example.com/plugins.git', path: 'cart' },
  { id: 'flags', version: '0.4.0', url: 'https://example.com/flags/plugin.json' },
];
const cart = { id: 'cart', origin: 'https://example.com/plugins.git' };

describe('checkUpdate', () => {
  it('offers a newer version with the upgrade command', () => {
    expect(checkUpdate({ ...cart, version: '1.2.0' }, registry)).toEqual({
      state: 'available',
      version: '1.3.0',
      command: 'devpul upgrade cart',
    });
  });

  it('adds --major-versions when the caret range excludes it', () => {
    expect(
      checkUpdate({ id: 'flags', version: '0.3.1', origin: 'https://example.com/flags/plugin.json' }, registry),
    ).toMatchObject({ state: 'available', command: 'devpul upgrade flags --major-versions' });
  });

  it('is current at or past the listed version', () => {
    expect(checkUpdate({ ...cart, version: '1.3.0' }, registry)).toEqual({ state: 'current' });
    expect(checkUpdate({ ...cart, version: '1.4.0-dev.1' }, registry)).toEqual({ state: 'current' });
  });

  it('cannot check other sources, ids or versions', () => {
    for (const plugin of [
      { ...cart, version: '1.2.0', origin: '../plugins/cart' },
      { id: 'cart', version: '1.2.0' },
      { ...cart, id: 'other', version: '1.2.0' },
      cart,
      { ...cart, version: 'dev' },
    ]) {
      expect(checkUpdate(plugin, registry)).toEqual({ state: 'unlisted' });
    }
  });

  it('links http(s) origins only', () => {
    expect(sourceHref('https://example.com/plugins.git')).toBe('https://example.com/plugins');
    expect(sourceHref('http://127.0.0.1:7171/cart.js')).toBe('http://127.0.0.1:7171/cart.js');
    expect(sourceHref('git@example.com:plugins.git')).toBeUndefined();
    expect(sourceHref('../../plugins/cart')).toBeUndefined();
    expect(sourceHref('devpul_flutter')).toBeUndefined();
    expect(sourceHref(undefined)).toBeUndefined();
  });
});
