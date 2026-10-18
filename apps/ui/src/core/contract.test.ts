import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { breadcrumbs } from './breadcrumbs';
import { type DevEvent, fromVm, type JsonObject } from './events';
import { deviceRows, fromSession, type Report, toSession } from './export';
import { parseInfo } from './info';
import { describeRule, parsePaused, parseRules } from './mocks';
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

const core = load('events.json');
const flutter = load('flutter.json');
const events = [...core, ...flutter];

// A 1x1 PNG.
const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('contract', () => {
  it('parses every event into the right tab', () => {
    const store = new Store();
    store.add(events);
    expect(store.size).toBe(events.length);
    expect(store.httpRows.map((r) => [r.method, r.state, r.status, r.mock])).toEqual([
      ['POST', 'done', 200, undefined],
      ['POST', 'done', 502, undefined],
      ['POST', 'done', 200, 'pause'],
      ['GET', 'done', 200, 'respond'],
      ['POST', 'done', 500, undefined],
      ['GET', 'error', undefined, undefined],
      ['POST', 'done', 201, undefined],
    ]);
    const [replay, paid, checkout] = store.httpRows;
    const started = store.other.find((e) => e.kind === 'cart.checkout');
    expect(paid?.replayable).toBe(true);
    expect(paid?.cause).toEqual({ type: 'event', kind: 'cart.checkout', seq: started?.seq });
    expect(replay?.cause).toEqual({ type: 'replay', id: paid?.id });
    expect(replay && store.httpRow(`${replay.session}|${paid?.id}`)).toBe(paid);
    expect(checkout?.paused && parsePaused(checkout.paused)).toMatchObject({
      stage: 'response',
      status: 402,
      editable: true,
    });
    expect(store.httpRows[6]?.size).toBe(11);
    const [flutterError, zoneError] = ['flutter', 'zone'].map((s) => store.errors.find((e) => e.data.source === s));
    expect(store.errors).toHaveLength(2);
    expect(flutterError?.data.widget).toBe('Cart');
    expect([flutterError?.data.route, zoneError?.data.route]).toEqual(['Cart', '/cart']);
    expect(readLocation(flutterError?.data.location)).toMatchObject({ file: 'file:///app/test/contract_test.dart' });
    expect(store.logs).toHaveLength(2);
    // The two files come from separate runs, so only the order within each is fixed.
    const kinds = (file: DevEvent[]) => store.other.filter((e) => file.includes(e)).map((e) => e.kind);
    expect(kinds(core)).toEqual(['big', 'cart.updated', 'cart.checkout']);
    expect(kinds(flutter)).toEqual(['route', 'lifecycle', 'lifecycle', 'route', 'route', 'route', 'route']);
    expect([...store.tags.get('env')!]).toEqual(['dev']);
    const run = [...store.runs.values()][0];
    expect(run?.session?.data.name).toBe('Shop');
    expect(run?.info && parseInfo(run.info.data).actions.map((a) => a.name)).toEqual(['Clear cache', 'Seed']);
    expect(run?.mocks && parseRules(run.mocks.data)).toEqual([]);
  });

  it('reads mock rules', () => {
    const set = events.find((e) => e.kind === 'http.mocks');
    expect(parseRules(set?.data).map((r) => [r.id, r.on, r.method, r.mode, describeRule(r)])).toEqual([
      ['flags', true, 'GET', 'respond', 'respond 200'],
      ['offline', false, null, 'fail', 'fail: Mocked network failure'],
      ['checkout', true, null, 'pause', 'pause the request and response'],
    ]);
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
    const report: Report = {
      ts: 1767225600100,
      run: events[0]!.run,
      screenshot: { image: PIXEL, width: 1, height: 1 },
      device: read('device.json') as JsonObject,
    };
    const session = toSession(events, report).replace(/"exported":\d+/, '"exported":0');
    const text = `${JSON.stringify(JSON.parse(session), null, 2)}\n`;
    if (process.env.DEVPUL_UPDATE_GOLDENS) writeFileSync(contract('session.json'), text);
    expect(readFileSync(contract('session.json'), 'utf8')).toBe(text);
    const { events: back, report: backReport } = fromSession(text, 'file', () => 0);
    expect(back.map((e) => [e.key, e.kind, e.data, e.tags])).toEqual(
      events.map((e) => [e.key, e.kind, e.data, e.tags]),
    );
    expect(backReport).toEqual(report);

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
        'GET failed https://example.com/slow',
        'lifecycle state: resumed',
        'lifecycle state: inactive',
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

  it('lists contract/device.json as a bug report shows it', () => {
    expect(deviceRows(read('device.json') as JsonObject)).toEqual([
      ['Platform', 'android'],
      ['OS', 'Android 15'],
      ['Build', 'debug'],
      ['Flutter', '3.32.0, Dart 3.8.0'],
      ['Locale', 'en-US'],
      ['Window', '360 x 800 at 3x'],
      ['Text scale', '1.3'],
      ['Brightness', 'light'],
      ['Accessibility', 'boldText'],
    ]);
  });

  it('reads the session file devpul_test writes for a failing test', () => {
    const store = new Store();
    store.add(fromSession(readFileSync(contract('test_session.json'), 'utf8'), 'file', () => 0).events);
    const [run, ...others] = store.runs.values();
    expect(others).toEqual([]);
    expect(run?.test?.data.name).toBe('cart adds an item');
    expect(run?.session?.data.name).toBe('Shop');
    const [error] = store.errors;
    expect(error?.data).toMatchObject({ source: 'test', type: 'TestFailure' });
    expect(breadcrumbs(store.all, store.httpRows, error!).map((c) => c.text)).toEqual([
      'cart.add sku: abc-1, qty: 2',
      'debug Adding abc-1',
      'test name: cart adds an item, suite: test/fixtures/shop.dart',
    ]);
  });
});
