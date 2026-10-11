import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CALL, MAX_LABEL, pluginCalls, registry, writes } from './plugins';

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

const record = () => {
  const sent: Record<string, unknown>[] = [];
  const calls = pluginCalls((_, params = {}) => {
    sent.push(params);
    return Promise.resolve({ result: 1 });
  });
  return { sent, calls };
};

describe('plugin calls', () => {
  afterEach(() => writes.set(false));

  it('takes writes from the switch, never from the plugin', async () => {
    const { sent, calls } = record();
    await calls.call(CALL, { name: 'a.b', writes: 'true' });
    await calls.request('a.b', { writes: 'true' });
    writes.set(true);
    await calls.call(CALL, { name: 'a.b', writes: 'false' });
    await calls.request('a.b');
    expect(sent).toEqual([
      { name: 'a.b' },
      { name: 'a.b', args: '{"writes":"true"}' },
      { name: 'a.b', writes: 'true' },
      { name: 'a.b', writes: 'true' },
    ]);
  });

  it('leaves other methods alone', async () => {
    const { sent, calls } = record();
    await calls.call('ext.app.x', { writes: 'true' });
    expect(sent).toEqual([{ writes: 'true' }]);
  });

  it('resolves to the result and rejects with the app message', async () => {
    expect(await record().calls.request('a.b')).toBe(1);
    const failing = pluginCalls(() =>
      Promise.reject({ code: -32000, message: 'Server error', data: { details: 'No handler named a.b.' } }),
    );
    await expect(failing.request('a.b')).rejects.toThrow('No handler named a.b.');
  });

  it('tells listeners when the switch changes', () => {
    const seen: boolean[] = [];
    const stop = writes.subscribe((on) => seen.push(on));
    writes.set(true);
    writes.set(true);
    writes.set(false);
    stop();
    writes.set(true);
    expect(seen).toEqual([true, false]);
  });

  it('calls handlers as contract/call.json', async () => {
    const { request, result, refused } = JSON.parse(
      readFileSync(new URL('../../../../../contract/call.json', import.meta.url), 'utf8'),
    ) as {
      request: { name: string; args: string };
      result: { result: unknown };
      refused: { data: { details: string } };
    };
    const sent: unknown[] = [];
    const { request: call } = pluginCalls((method, params) => {
      sent.push({ method, params });
      return params?.writes ? Promise.resolve(result) : Promise.reject(refused);
    });
    const args = JSON.parse(request.args) as Record<string, unknown>;
    writes.set(true);
    expect(await call(request.name, args)).toEqual(result.result);
    writes.set(false);
    await expect(call(request.name, args)).rejects.toThrow(refused.data.details);
    expect(sent[0]).toEqual({ method: 'ext.devpul.call', params: request });
  });
});
