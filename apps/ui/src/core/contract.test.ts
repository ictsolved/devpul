import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { breadcrumbs } from './breadcrumbs';
import { type DevEvent, fromVm, type JsonObject } from './events';
import { fromSession, toSession } from './export';
import { parseInfo } from './info';
import { readLocation } from './location';
import { parseRegistry } from './registry';
import { Store } from './store';

// Fixtures written by the Dart packages' golden tests (tool/update_goldens.sh).
const contract = (name: string) => new URL(`../../../../contract/${name}`, import.meta.url);
const read = (name: string): unknown => JSON.parse(readFileSync(contract(name), 'utf8'));

let n = 0;
function load(name: string): DevEvent[] {
  return (read(name) as { kind: string; data: JsonObject }[]).map((item) => {
    const e = fromVm(
      {
        extensionKind: item.kind,
        extensionData: item.data,
        isolate: { id: 'isolates/1', name: 'main' },
        isolateGroup: { id: 'isolateGroups/1' },
      },
      'c1',
      ++n,
    );
    if (!e || e === 'outdated') throw new Error(`${item.kind} did not parse`);
    return e;
  });
}

const events = [...load('events.json'), ...load('flutter.json')];

describe('contract', () => {
  it('parses every event into the right tab', () => {
    const store = new Store();
    store.add(events);
    expect(store.size).toBe(events.length);
    expect(store.httpRows.map((r) => [r.method, r.state, r.status])).toEqual([
      ['POST', 'done', 500],
      ['GET', 'error', undefined],
      ['POST', 'done', 201],
    ]);
    expect(store.httpRows[2]?.size).toBe(11);
    expect(store.errors.map((e) => e.data.source)).toEqual(['flutter', 'zone']);
    expect(store.errors[0]?.data.widget).toBe('Cart');
    expect(store.errors.map((e) => e.data.route)).toEqual(['Cart', '/cart']);
    expect(readLocation(store.errors[0]?.data.location)).toMatchObject({ file: 'file:///app/test/contract_test.dart' });
    expect(store.logs).toHaveLength(2);
    expect(store.other.map((e) => e.kind)).toEqual([
      'route',
      'route',
      'route',
      'route',
      'route',
      'big',
      'cart.updated',
    ]);
    expect([...store.tags.get('env')!]).toEqual(['dev']);
    const run = [...store.runs.values()][0];
    expect(run?.session?.data.name).toBe('Shop');
    expect(run?.info && parseInfo(run.info.data).actions.map((a) => a.name)).toEqual(['Clear cache', 'Seed']);
  });

  it('reads the handshake', () => {
    const info = parseInfo(read('info.json') as JsonObject);
    expect(info).toMatchObject({ protocol: 1, limits: { frame: 0 }, dropped: { frame: 1 } });
    expect(info.actions[1]?.params.map((p) => p.type)).toEqual(['text', 'number', 'flag', 'choice']);
    expect(info.plugins).toEqual([
      {
        id: 'my_plugin',
        version: '1.0.0',
        origin: 'https://example.com/my_plugin.git',
        description: 'Cart contents and totals in a Cart tab.',
        hash: '9aeb8d59b4d483ca6298e9a450fbf37dfd2b4c63990135ab1d040d76314087ec',
      },
    ]);
  });

  it('reads the registry', () => {
    expect(parseRegistry(read('registry.json'))).toEqual([
      { id: 'cart', version: '1.3.0', url: 'https://example.com/plugins.git', path: 'cart' },
      { id: 'flags', version: '0.3.1', url: 'https://example.com/flags/plugin.json' },
    ]);
    expect(() => parseRegistry({ format: 2, plugins: [] })).toThrow('not format 1');
  });

  it('writes contract/session.json and reads it back', () => {
    const text = `${JSON.stringify(JSON.parse(toSession(events).replace(/"exported":\d+/, '"exported":0')), null, 2)}\n`;
    if (process.env.DEVPUL_UPDATE_GOLDENS) writeFileSync(contract('session.json'), text);
    expect(readFileSync(contract('session.json'), 'utf8')).toBe(text);
    const back = fromSession(text, 'file', () => 0);
    expect(back.map((e) => [e.key, e.kind, e.data, e.tags])).toEqual(
      events.map((e) => [e.key, e.kind, e.data, e.tags]),
    );

    const store = new Store();
    store.add(back);
    const crumbs = (e: DevEvent) => breadcrumbs(store.all, store.httpRows, e).map((c) => c.text);
    // devpul mcp builds the same crumbs in Dart and writes them there.
    expect(
      store.errors.toReversed().map((e) => ({
        error: e.key,
        crumbs: breadcrumbs(store.all, store.httpRows, e).map((c) => ({
          kind: c.kind,
          key: c.key,
          offset: c.offset,
          text: c.text,
        })),
      })),
    ).toEqual(read('breadcrumbs.json'));
    expect(store.errors.map(crumbs)).toEqual([
      [
        'push Cart',
        'POST 201 https://example.com/items?page=1&tag=a&tag=b',
        'pop /checkout',
        'error Sync failed',
        'replace /checkout',
        'info Signed in',
        'push /cart',
        'push /',
      ],
      ['pop /checkout', 'error Sync failed', 'replace /checkout', 'info Signed in', 'push /cart', 'push /'],
    ]);
  });
});
