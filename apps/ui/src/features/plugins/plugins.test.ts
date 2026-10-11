import { afterEach, describe, expect, it } from 'vitest';
import { MAX_LABEL, registry } from './plugins';

describe('registry', () => {
  afterEach(() => registry.unregister('test'));

  it('refuses a missing or too long label', () => {
    expect(() => registry.register({ id: 'a', label: '' }, 'test')).toThrow('string id and label');
    expect(() => registry.register({ id: 'a', label: 'x'.repeat(MAX_LABEL + 1) }, 'test')).toThrow(
      `The label of a has ${MAX_LABEL + 1} characters; the limit is ${MAX_LABEL}.`,
    );
    registry.register({ id: 'a', label: 'x'.repeat(MAX_LABEL) }, 'test');
    expect(registry.getPlugins().map((p) => p.plugin.id)).toEqual(['a']);
  });
});
