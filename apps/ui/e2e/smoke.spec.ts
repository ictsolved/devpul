import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, expect, test } from './fixtures.ts';
import { FakeDtd, FakeVm, fixtureEvents, PLUGIN } from './vm.ts';

type JsonObject = Record<string, unknown>;

const site = JSON.parse(readFileSync(join(import.meta.dirname, '../../../site.json'), 'utf8')) as {
  url: string;
  registry: string;
};

test('connects from a #connect= link and shows the fixture events in each tab', async ({ page, vm }) => {
  await connect(page, vm);
  await expect(page.getByRole('list', { name: 'Connections' })).toContainText('Shop');

  const requests = page.getByRole('grid', { name: 'Requests' });
  for (const url of ['example.com/items', 'example.com/slow', 'example.com/upload']) {
    await expect(requests.getByRole('row', { name: new RegExp(url) })).toBeVisible();
  }

  await page.getByRole('tab', { name: /^Errors/ }).click();
  const errors = page.getByRole('grid', { name: 'Errors' });
  await expect(errors.getByRole('row', { name: /Bad state: boom/ })).toBeVisible();
  await errors.getByRole('row', { name: /Bad state: layout/ }).click();
  const widget = page.getByRole('complementary', { name: 'Detail' }).locator('section', { hasText: 'Widget' }).first();
  await expect(widget).toContainText('Cart');
  await expect(widget).toContainText(/contract_test\.dart:\d+:\d+/);

  await page.getByRole('tab', { name: /^Logs/ }).click();
  const logs = page.getByRole('grid', { name: 'Logs' });
  await expect(logs.getByRole('row', { name: /Signed in/ })).toBeVisible();
  await expect(logs.getByRole('row', { name: /Sync failed/ })).toBeVisible();

  await page.getByRole('tab', { name: /^Events/ }).click();
  const events = page.getByRole('grid', { name: 'Events' });
  for (const kind of ['cart.updated', 'big', 'route']) {
    await expect(events.getByRole('row', { name: new RegExp(kind) }).first()).toBeVisible();
  }
  await expect(events.getByRole('row', { name: /route/ })).toHaveCount(5);
});

test('connects another app from the header', async ({ page, vm }) => {
  const other = await FakeVm.start({ token: 'otherToken=' });
  await connect(page, vm);
  await expect(page.getByRole('textbox', { name: 'VM service URL' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Connect another app' }).click();
  const field = page.getByRole('textbox', { name: 'VM service URL' });
  await expect(field).toBeFocused();
  await field.fill('not a url');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Not a VM service URL.')).toBeVisible();
  await field.fill(other.url);
  await page.keyboard.press('Enter');
  await expect(field).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Connections' }).getByRole('listitem')).toHaveCount(2);
  await other.close();
});

test('shows developer.log records and reads a cut message in full', async ({ page, vm }) => {
  // Before the UI connects: DDS replays them on subscribe.
  vm.log();
  await connect(page, vm);
  await page.getByRole('tab', { name: /^Logs/ }).click();
  const logs = page.getByRole('grid', { name: 'Logs' });
  await logs.getByRole('row', { name: /token refresh failed/ }).click();
  const detail = page.getByRole('complementary', { name: 'Detail' });
  await expect(detail).toContainText('warning');
  await expect(detail).toContainText('Bad state: expired');
  await expect(detail).toContainText('#0      main (file:///app/main.dart:5:3)');

  await logs.getByRole('row', { name: /sku-1/ }).click();
  const message = detail.locator('pre').first();
  await expect(message).toHaveText(/\]\}$/);
  expect((await message.textContent())?.length).toBe(371);

  await page.getByRole('group', { name: 'Source' }).getByRole('button', { name: 'developer.log' }).click();
  await expect(logs.getByRole('row')).toHaveCount(2);

  // A reload loads the kept records and gets the same ones replayed; a later event shows the replay is in.
  const subscribed = () => vm.callsTo('streamListen').filter((p) => p.streamId === 'Logging').length;
  const reload = async (times: number, text: string) => {
    // Kept events are written 500 ms after they arrive.
    await page.waitForTimeout(700);
    await page.reload();
    await expect.poll(subscribed).toBe(times);
    vm.emit('log', { level: 'info', message: text });
    await expect(logs.getByRole('row', { name: new RegExp(text) })).toBeVisible();
  };
  await page.getByRole('group', { name: 'Source' }).getByRole('button', { name: 'developer.log' }).click();
  await reload(2, 'After reload');
  await expect(logs.getByRole('row')).toHaveCount(5);

  // Replayed records stay cleared.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await reload(3, 'After clear');
  await expect(logs.getByRole('row')).toHaveCount(1);
});

test('opens HTTP detail', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('row', { name: /example\.com\/items/ }).click();
  const detail = page.getByRole('complementary', { name: 'Request detail' });
  await expect(detail).toContainText('201');
  await expect(detail).toContainText('https://example.com/items/7');
  await expect(detail.getByRole('heading', { name: 'Response body' })).toBeVisible();
  await expect(detail).toContainText('{ "ok": true }');
  await expect(detail.getByRole('button', { name: 'curl' })).toBeVisible();
});

test('shares the tree and raw switch across details and reloads', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('row', { name: /example\.com\/items/ }).click();
  const detail = page.getByRole('complementary', { name: 'Request detail' });
  const tree = detail.getByRole('group', { name: 'JSON view' }).getByRole('button', { name: 'Tree' });
  await expect(tree).toHaveAttribute('aria-pressed', 'false');
  await tree.click();
  await expect(tree).toHaveAttribute('aria-pressed', 'true');
  await expect(detail).toContainText('ok: true');

  await page.getByRole('tab', { name: /^Events/ }).click();
  await page
    .getByRole('grid', { name: 'Events' })
    .getByRole('row', { name: /cart\.updated/ })
    .click();
  const event = page.getByRole('complementary', { name: 'Detail' });
  await expect(event).toContainText('items: 3');
  const raw = event.getByRole('group', { name: 'JSON view' }).getByRole('button', { name: 'Raw' });
  await raw.press('Enter');
  await expect(raw).toHaveAttribute('aria-pressed', 'true');
  await expect(event).toContainText('"items": 3');

  await page.reload();
  await page.getByRole('tab', { name: /^Events/ }).click();
  await page
    .getByRole('grid', { name: 'Events' })
    .getByRole('row', { name: /cart\.updated/ })
    .click();
  await expect(event).toContainText('"items": 3');
});

const part = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');

test('decodes a bearer JWT in HTTP detail', async ({ page, vm }) => {
  await connect(page, vm);
  const ts = Date.UTC(2026, 9, 14, 9, 0, 0);
  const token = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: 'user-42', exp: ts / 1000 - 300 })}.c2ln`;
  vm.post({
    kind: 'devpul.http.request',
    data: {
      v: 1,
      session: 's2',
      seq: 1,
      ts,
      data: { id: 'jwt', method: 'GET', url: 'https://example.com/me', headers: { authorization: `Bearer ${token}` } },
    },
  });
  await page.getByRole('row', { name: /example\.com\/me/ }).click();
  const detail = page.getByRole('complementary', { name: 'Request detail' });
  await expect(detail.getByRole('heading', { name: 'Bearer token' })).toBeVisible();
  await expect(detail).toContainText('expired 5 min before the request');
  await expect(detail.getByRole('row', { name: /^sub user-42$/ })).toBeVisible();
  await expect(detail.getByRole('row', { name: /^alg HS256$/ })).toBeVisible();
});

test('decodes values in JSON trees and header tables', async ({ page, vm, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await connect(page, vm);
  const ts = Date.UTC(2026, 9, 14, 9, 0, 0);
  const token = `${part({ alg: 'HS256' })}.${part({ sub: 'user-42', exp: ts / 1000 })}.c2ln`;
  const post = (kind: string, seq: number, data: Record<string, unknown>) =>
    vm.post({ kind: `devpul.${kind}`, data: { v: 1, session: 's2', seq, ts, data } });
  post('session.saved', 1, {
    user: { token, prefs: '{"theme":"dark"}', note: Buffer.from('hello').toString('base64') },
    created_at: ts,
  });
  post('http.request', 2, { id: 'dates', method: 'GET', url: 'https://example.com/dates' });
  post('http.response', 3, {
    id: 'dates',
    method: 'GET',
    url: 'https://example.com/dates',
    status: 200,
    headers: { 'last-modified': 'Wed, 14 Oct 2026 09:00:00 GMT', 'x-ratelimit-remaining': '9' },
  });

  await page.getByRole('tab', { name: /^Events/ }).click();
  await page
    .getByRole('grid', { name: 'Events' })
    .getByRole('row', { name: /session\.saved/ })
    .click();
  const event = page.getByRole('complementary', { name: 'Detail' });
  await event.getByRole('group', { name: 'JSON view' }).getByRole('button', { name: 'Tree' }).click();
  await expect(event.getByText('created_at:')).toContainText('2026-10-14');

  await event.getByRole('button', { name: 'JWT', exact: true }).click();
  const jwt = event.getByRole('group', { name: 'Decoded as JWT' });
  await expect(jwt).toContainText('sub: "user-42"');
  await expect(jwt.getByText('exp:')).toContainText('2026-10-14');
  await event.getByRole('button', { name: 'JWT', exact: true }).click();
  await expect(jwt).toBeHidden();

  await event.getByRole('button', { name: 'JSON', exact: true }).click();
  await expect(event.getByRole('group', { name: 'Decoded as JSON' })).toContainText('theme: "dark"');

  await event.getByText('note:').click({ button: 'right' });
  const menu = page.getByRole('menu', { name: 'Value' });
  await menu.getByRole('menuitem', { name: 'Base64' }).click();
  const base64 = event.getByRole('group', { name: 'Decoded as Base64' });
  await expect(base64).toContainText('"hello"');
  await base64.getByRole('button', { name: 'Close Base64' }).click();
  await expect(base64).toBeHidden();

  await event.getByText('note:').click({ button: 'right' });
  await menu.getByRole('menuitem', { name: 'JWT' }).click();
  await expect(event.getByRole('group', { name: 'Decoded as JWT' })).toContainText('Not a signed JWT.');

  await event.getByText('note:').hover();
  await event.getByText('note:').getByRole('button', { name: 'Value menu' }).click();
  await menu.getByRole('menuitem', { name: 'Copy path' }).click();
  await expect(menu).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('user.note');
  await expect(event.getByText('note:').getByRole('button', { name: 'Value menu' })).toBeFocused();

  await page.getByRole('tab', { name: /^HTTP/ }).click();
  await page.getByRole('row', { name: /example\.com\/dates/ }).click();
  const detail = page.getByRole('complementary', { name: 'Request detail' });
  await expect(detail.getByRole('row', { name: /^last-modified/ })).toContainText('GMT2026-10-14');
  await expect(detail.getByRole('row', { name: /^x-ratelimit-remaining/ })).toHaveText(/^x-ratelimit-remaining9/);
});

test('previews image bodies and data image strings', async ({ page, vm }) => {
  await connect(page, vm);
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const src = `data:image/png;base64,${png}`;
  const ts = Date.UTC(2026, 9, 14, 9, 0, 0);
  const post = (kind: string, seq: number, data: Record<string, unknown>) =>
    vm.post({ kind: `devpul.${kind}`, data: { v: 1, session: 's2', seq, ts, data } });
  post('http.request', 1, { id: 'img', method: 'GET', url: 'https://example.com/logo.png' });
  post('http.response', 2, { id: 'img', method: 'GET', url: 'https://example.com/logo.png', status: 200, body: src });
  post('profile.loaded', 3, { user: { name: 'Ada', avatar: src } });
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="8"><rect width="12" height="8"/></svg>';
  post('shape.drawn', 4, { shape: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` });

  await page.getByRole('row', { name: /example\.com\/logo\.png/ }).click();
  const detail = page.getByRole('complementary', { name: 'Request detail' });
  await expect(detail.getByRole('img', { name: 'image/png preview' })).toBeVisible();
  await expect(detail).toContainText(`image/png · 1×1 · ${Buffer.from(png, 'base64').length} B`);

  await page.getByRole('tab', { name: /^Events/ }).click();
  await page
    .getByRole('grid', { name: 'Events' })
    .getByRole('row', { name: /profile\.loaded/ })
    .click();
  const event = page.getByRole('complementary', { name: 'Detail' });
  await event.getByRole('group', { name: 'JSON view' }).getByRole('button', { name: 'Tree' }).click();
  const thumb = event.getByRole('button', { name: 'Show larger' });
  await expect(thumb.getByRole('img')).toBeVisible();
  await thumb.click();
  await expect(event.getByRole('button', { name: 'Show smaller' })).toHaveAttribute('aria-expanded', 'true');

  // Another event's image starts small.
  await page
    .getByRole('grid', { name: 'Events' })
    .getByRole('row', { name: /shape\.drawn/ })
    .click();
  await expect(event.getByRole('button', { name: 'Show larger' })).toContainText('image/svg+xml · 12×8');
});

test('reads requests from the dart:io HTTP profile only while its toggle is on', async ({ page, vm }) => {
  await connect(page, vm);
  const toggle = page.getByRole('button', { name: 'HTTP without an adapter' });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  const polls = () => vm.callsTo('ext.dart.io.getHttpProfile').length;
  await page.waitForTimeout(1500);
  expect(vm.callsTo('ext.dart.io.httpEnableTimelineLogging')).toEqual([]);
  expect(polls()).toBe(0);
  // dart:io records nothing with logging off.
  vm.profile();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => vm.httpLogging).toBe(true);
  vm.profile();
  const requests = page.getByRole('grid', { name: 'Requests' });
  const local = requests.getByRole('row', { name: /127\.0\.0\.1/ });
  // The redirect hop is not a row of its own.
  await expect(local).toHaveCount(4);
  await requests.getByRole('row', { name: /\/old/ }).click();
  const detail = page.getByRole('complementary', { name: 'Request detail' });
  await expect(detail).toContainText('dart:io');
  await expect(detail).toContainText('redirected to http://127.0.0.1:8080/items');
  await expect(detail).toContainText('{ "ok": true }');
  await requests.getByRole('row', { name: /8081\/down/ }).click();
  await expect(detail).toContainText('SocketException: Connection refused');

  // Kept per VM service origin; the whole profile comes back, its bodies are not read again.
  await page.waitForTimeout(700);
  const reads = vm.callsTo('ext.dart.io.getHttpProfileRequest').length;
  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  const before = polls();
  await expect.poll(polls).toBeGreaterThan(before);
  await expect(local).toHaveCount(4);
  expect(vm.callsTo('ext.dart.io.getHttpProfileRequest')).toHaveLength(reads);

  await toggle.click();
  await expect.poll(() => vm.httpLogging).toBe(false);
  const after = polls();
  await page.waitForTimeout(2500);
  expect(polls()).toBe(after);
  await expect(local).toHaveCount(4);
});

test.describe('on web', () => {
  test.use({ vmOptions: { web: true } });

  test('offers no HTTP profile', async ({ page, vm }) => {
    await connect(page, vm);
    await expect(page.getByRole('list', { name: 'Connections' }).getByLabel('open')).toBeVisible();
    await expect(page.getByRole('button', { name: 'HTTP without an adapter' })).toHaveCount(0);
  });
});

test('opens breadcrumbs from an error and goes back to the error', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('tab', { name: /^Errors/ }).click();
  await page.getByRole('row', { name: /Bad state: layout/ }).click();
  const detail = page.getByRole('complementary', { name: 'Detail' });
  await expect(detail.getByTitle('Route at the error')).toHaveText('Cart');
  const crumbs = detail.getByRole('list', { name: 'Breadcrumbs' });
  await expect(crumbs.getByRole('button')).toHaveText([
    /route\s*push Cart/,
    /GET.*example\.com\/slow/,
    /event\s*lifecycle state: resumed/,
    /event\s*lifecycle state: inactive/,
    /POST.*example\.com\/items/,
    /route\s*pop \/checkout/,
    /log\s*error Sync failed/,
    /route\s*replace \/checkout/,
    /log\s*info Signed in/,
    /route\s*push \/cart/,
    /route\s*push \//,
  ]);

  await crumbs.getByRole('button', { name: /example\.com\/items/ }).click();
  await expect(page.getByRole('tab', { name: /^HTTP/ })).toHaveAttribute('aria-selected', 'true');
  const request = page.getByRole('complementary', { name: 'Request detail' });
  await expect(request).toContainText('https://example.com/items');
  await request.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('tab', { name: /^Errors/ })).toHaveAttribute('aria-selected', 'true');

  await crumbs.getByRole('button', { name: /Sync failed/ }).click();
  await expect(page.getByRole('tab', { name: /^Logs/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('row', { name: /Sync failed/ })).toHaveAttribute('aria-selected', 'true');
  await detail.getByRole('button', { name: 'Back' }).click();
  await expect(detail).toContainText('Bad state: layout');
});

test('Clear keeps cleared events out after a reload', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByRole('grid', { name: 'Requests' }).getByRole('row', { name: /example\.com/ })).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole('list', { name: 'Connections' }).getByLabel('open')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);

  vm.emit('log', { level: 'info', message: 'After clear', name: 'auth' });
  await page.getByRole('tab', { name: /^Logs/ }).click();
  const logs = page.getByRole('grid', { name: 'Logs' }).getByRole('row');
  await expect(logs).toHaveCount(1);
  await expect(logs).toContainText('After clear');
  await expect(page.getByRole('tab', { name: /^HTTP/ })).toHaveText('HTTP');
});

test('keeps settings and sets limits in the app', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toContainText(`In memory: ${vm.events.length} events`);
  await dialog.getByLabel('Slow from (ms)', { exact: true }).fill('250');

  await dialog.getByText('Limits', { exact: true }).click();
  await dialog.getByRole('checkbox', { name: 'Mute log' }).click();
  await expect
    .poll(() => vm.callsTo('ext.devpul.limit'))
    .toEqual([{ isolateId: 'isolates/1', kind: 'log', perSecond: '0' }]);
  await expect(dialog.getByRole('checkbox', { name: 'Mute log' })).toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'log per second' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'More' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog').getByLabel('Slow from (ms)', { exact: true })).toHaveValue('250');
});

test('offers the app plugin and loads it once allowed', async ({ page, vm }) => {
  await connect(page, vm);
  const offer = page.getByRole('alert');
  await expect(offer).toContainText('Shop offers the plugin my_plugin 1.0.0');
  await expect(page.getByRole('tab', { name: /^Cart/ })).toHaveCount(0);
  await offer.getByRole('button', { name: 'Allow' }).click();

  await expect(offer).toHaveCount(0);
  await expect(page.getByRole('tab', { name: /^Cart/ }).locator('svg circle')).toHaveCount(1);
  await page.getByRole('tab', { name: /^Cart/ }).click();
  await page
    .getByRole('grid', { name: 'Cart' })
    .getByRole('row', { name: /3 items/ })
    .click();
  const detail = page.getByRole('complementary', { name: 'Detail' });
  await expect(detail).toContainText('42.5');
  await detail.getByText('42.5').click({ button: 'right' });
  await page.getByRole('menu', { name: 'Value' }).getByRole('menuitem', { name: 'Timestamp' }).click();
  const time = detail.getByRole('group', { name: 'Decoded as Timestamp' });
  await expect(time).toContainText('(Unix seconds)');
  await time.getByRole('button', { name: 'Close Timestamp' }).click();
  await expect(time).toBeHidden();
  await page.getByRole('tab', { name: /^Events/ }).click();
  await expect(page.getByRole('grid', { name: 'Events' }).getByRole('row', { name: /cart\.updated/ })).toHaveCount(0);

  // The handshake hash matches the approved, cached source, so the app is not asked for it again.
  expect(vm.callsTo('ext.devpul.plugin')).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole('tab', { name: /^Cart/ })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(() => vm.callsTo('ext.devpul.backlog').length).toBe(2);
  await page.waitForTimeout(300);
  expect(vm.callsTo('ext.devpul.plugin')).toHaveLength(1);
});

test('lists offers and approvals in the Plugins view, with no app connected too', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('alert').getByRole('button', { name: 'Not now' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);

  await page.getByRole('tab', { name: /^Plugins/ }).click();
  const view = page.getByRole('region', { name: 'Plugins' });
  await expect(view).toContainText('Shop offers the plugin my_plugin 1.0.0');
  await expect(view.getByRole('button', { name: 'Not now' })).toHaveCount(0);
  await view.getByRole('button', { name: 'Allow' }).click();
  await expect(view.getByRole('listitem').filter({ hasText: 'my_plugin' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Cart/ })).toBeVisible();

  await page.getByRole('button', { name: /^Remove (ws|http)/ }).click();
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await page.getByRole('button', { name: 'My plugins', exact: true }).click();
  const item = page.getByRole('region', { name: 'Plugins' }).getByRole('listitem').filter({ hasText: 'my_plugin' });
  await item.getByRole('switch', { name: 'Enable my_plugin' }).click();
  await expect(item).toContainText('Disabled');
});

test.describe('with a plugin that writes', () => {
  // Calls the handler in contract/call.json both ways; `call` tries to set writes itself.
  const writer = `export default {
  api: 1,
  id: 'cart',
  label: 'Cart',
  kinds: ['cart.updated'],
  renderTab(el, context) {
    const state = document.createElement('p');
    const out = document.createElement('p');
    out.setAttribute('role', 'status');
    const show = () => (state.textContent = context.writes ? 'writes on' : 'writes off');
    const button = (label, run) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => run().then((r) => (out.textContent = JSON.stringify(r)), (e) => (out.textContent = e.data?.details ?? e.message));
      el.append(b);
    };
    button('Request', () => context.request('cart.set', { sku: 'abc-1', qty: 2 }));
    button('Call', () => context.call('ext.devpul.call', { name: 'cart.set', args: '{}', writes: 'true' }));
    el.append(state, out);
    show();
    return context.onWritesChange(show);
  },
};
`;
  test.use({ vmOptions: { plugins: { my_plugin: writer } } });

  test('gates writes on the switch, never on the plugin', async ({ page, vm }) => {
    await connect(page, vm);
    await page.getByRole('alert').getByRole('button', { name: 'Allow' }).click();
    await page.getByRole('tab', { name: /^Cart/ }).click();
    const out = page.getByRole('status').filter({ hasText: /writes|sku/ });
    await expect(page.getByText('writes off', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Request' }).click();
    await expect(out).toHaveText('cart.set changes the app; turn on Allow writes in the Plugins tab.');
    await page.getByRole('button', { name: 'Call', exact: true }).click();
    await expect(out).toHaveText('cart.set changes the app; turn on Allow writes in the Plugins tab.');
    expect(vm.callsTo('ext.devpul.call').map((p) => p.writes)).toEqual([undefined, undefined]);

    await page.getByRole('tab', { name: /^Plugins/ }).click();
    await page.getByRole('switch', { name: /Allow writes/ }).click();
    const status = page.getByRole('contentinfo');
    await expect(status.getByRole('button', { name: 'Writes on' })).toBeVisible();
    await page.getByRole('tab', { name: /^Cart/ }).click();
    await expect(page.getByText('writes on', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Request' }).click();
    await expect(out).toHaveText('{"sku":"abc-1","qty":2}');

    await status.getByRole('button', { name: 'Writes on' }).click();
    await expect(page.getByText('writes off', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /^Plugins/ }).click();
    await page.getByRole('switch', { name: /Allow writes/ }).click();
    await page.reload();
    await expect(page.getByRole('tab', { name: /^Cart/ })).toBeVisible();
    await expect(status.getByRole('button', { name: 'Writes on' })).toHaveCount(0);
  });
});

test.describe('with a plugin that lists the requests its events started', () => {
  const linker = `export default {
  api: 1,
  id: 'cart',
  label: 'Cart',
  kinds: (kind) => kind.startsWith('cart.'),
  renderTab(el, context) {
    const add = (r) => {
      const b = document.createElement('button');
      b.textContent = r.method + ' ' + (r.status ?? r.state) + ' ' + r.url;
      b.onclick = () => context.openRequest(r.key);
      el.append(b);
    };
    context.requests.forEach(add);
    return context.onRequests((requests) => requests.forEach(add));
  },
};
`;
  test.use({ vmOptions: { plugins: { my_plugin: linker } } });

  test('lists them, hears of new ones and opens one', async ({ page, vm }) => {
    await connect(page, vm);
    await page.getByRole('alert').getByRole('button', { name: 'Allow' }).click();
    await page.getByRole('tab', { name: /^Cart/ }).click();
    await expect(page.getByRole('button', { name: 'POST 502 https://example.com/pay' })).toBeVisible();
    vm.emit('http.request', {
      id: 80,
      method: 'GET',
      url: 'https://example.com/cart',
      cause: { type: 'event', kind: 'cart.checkout', seq: 22 },
    });
    await expect(page.getByRole('button', { name: 'GET pending https://example.com/cart' })).toBeVisible();
    await page.getByRole('button', { name: 'POST 502 https://example.com/pay' }).click();
    const detail = page.getByRole('complementary', { name: 'Request detail' });
    await expect(detail).toContainText('#6');
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('tab', { name: /^Cart/ })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('with two plugins and a limit', () => {
  const info = {
    ...(JSON.parse(readFileSync(join(import.meta.dirname, '../../../contract/info.json'), 'utf8')) as object),
    plugins: [{ id: 'my_plugin' }, { id: 'long' }],
    limits: { route: 0 },
  };
  const long = PLUGIN.replace("id: 'cart'", "id: 'long'").replace("label: 'Cart'", `label: '${'x'.repeat(33)}'`);
  test.use({
    vmOptions: {
      events: fixtureEvents().map((e) =>
        e.kind === 'devpul.app.info' ? { ...e, data: { ...e.data, data: info } } : e,
      ),
      info,
      plugins: { my_plugin: PLUGIN, long },
    },
  });

  test('shows one offer at a time and the status bar', async ({ page, vm }) => {
    await connect(page, vm);
    const offers = page.getByRole('alert');
    await expect(offers).toHaveCount(1);
    await offers.getByRole('button', { name: '+1 more' }).click();
    await expect(offers).toHaveCount(2);
    await offers.filter({ hasText: 'plugin long' }).getByRole('button', { name: 'Allow' }).click();

    const status = page.getByRole('contentinfo');
    await expect(status).toContainText('Connected');
    await expect(status.getByLabel('Session')).toContainText('name Shop');
    await expect(status.getByRole('button', { name: '1 muted' })).toBeVisible();
    await status.getByRole('button', { name: '1 plugin error' }).click();
    await expect(page.getByRole('tab', { name: /^Plugins/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('region', { name: 'Plugins' })).toContainText(
      'The label of long has 33 characters; the limit is 32.',
    );
  });
});

test('checks plugin updates against the registry only on click', async ({ page, vm }) => {
  const { registry } = site;
  const external: string[] = [];
  page.on('request', (r) => {
    if (!['127.0.0.1', 'localhost'].includes(new URL(r.url()).hostname)) external.push(r.url());
  });
  await page.route(registry, (route) =>
    route.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: { format: 1, plugins: [{ id: 'my_plugin', version: '2.0.0', url: 'https://example.com/my_plugin.git' }] },
    }),
  );

  await connect(page, vm);
  await page.getByRole('alert').getByRole('button', { name: 'Allow' }).click();
  await page.getByRole('tab', { name: /^Plugins/ }).click();
  const view = page.getByRole('region', { name: 'Plugins' });
  const item = view.getByRole('listitem').filter({ hasText: 'my_plugin' });
  await expect(item).toContainText('Cart contents and totals in a Cart tab.');
  await expect(item.locator('svg circle')).toHaveCount(1);
  await expect(item.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://example.com/my_plugin');
  expect(external).toEqual([]);

  await view.getByRole('button', { name: 'Check for updates' }).click();
  await expect(item).toContainText('2.0.0 available');
  await expect(view).toContainText('devpul upgrade my_plugin --major-versions');
  expect(external).toEqual([registry]);
});

test('runs an action with params', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Seed…' }).click();
  const form = page.getByRole('dialog', { name: 'Seed' });
  await form.getByLabel('name').fill('e2e');
  await form.getByLabel('count').fill('5');
  await form.getByRole('checkbox', { name: 'clear' }).click();
  await form.getByLabel('env').selectOption('prod');
  await form.getByRole('button', { name: 'Run' }).click();

  await expect(page.getByRole('status')).toHaveText('Seed: done');
  const [call] = vm.callsTo('ext.devpul.action');
  expect(call).toMatchObject({ isolateId: 'isolates/1', name: 'Seed' });
  expect(JSON.parse(String(call?.args))).toEqual({ name: 'e2e', count: 5, clear: true, env: 'prod' });
});

test('disables actions while the app is paused', async ({ page, vm }) => {
  await connect(page, vm);
  vm.pause();
  await expect(page.getByRole('list', { name: 'Connections' })).toContainText('paused');
  await page.getByRole('button', { name: 'Actions' }).click();
  await expect(page.getByRole('menu')).toContainText('paused in the debugger');
  await expect(page.getByRole('menuitem', { name: 'Clear cache' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');

  vm.resume();
  await expect(page.getByRole('list', { name: 'Connections' })).not.toContainText('paused');
  await page.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('menuitem', { name: 'Clear cache' }).click();
  await expect(page.getByRole('status')).toHaveText('Clear cache: done');
  expect(vm.callsTo('ext.devpul.action')).toEqual([{ isolateId: 'isolates/1', name: 'Clear cache' }]);
});

test('hides hot reload and restart without flutter run', async ({ page, vm }) => {
  await connect(page, vm);
  await expect(page.getByRole('button', { name: 'Actions' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});

test.describe('under flutter run', () => {
  test.use({ vmOptions: { flutterRun: true } });

  test('hot reloads and restarts from the buttons and keys', async ({ page, vm }) => {
    await connect(page, vm);
    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByRole('status')).toHaveText('Reloaded');
    await page.keyboard.press('Shift+R');
    await expect(page.getByRole('status')).toHaveText('Restarted');
    expect(vm.callsTo('s1.reloadSources')).toEqual([{ isolateId: 'isolates/1' }]);
    expect(vm.callsTo('s1.hotRestart')).toEqual([{ isolateId: 'isolates/1' }]);
  });
});

const CART_ERROR = {
  source: 'zone',
  type: 'StateError',
  message: 'Bad state: cart',
  stack: '#0      Cart.add (package:shop/cart.dart:12:5)\n#1      _rootRun (dart:async/zone.dart:1525:13)',
};

test.describe('launched from an IDE', () => {
  test.use({ vmOptions: { ide: true } });

  test('sends a stack frame to the IDE', async ({ page, vm }) => {
    await connect(page, vm);
    vm.emit('error', CART_ERROR);
    await page.getByRole('tab', { name: /^Errors/ }).click();
    await page.getByRole('row', { name: /Bad state: cart/ }).click();
    const stack = page.getByRole('complementary', { name: 'Detail' }).locator('section', { hasText: 'Stack trace' });
    await expect(stack.getByRole('button', { name: 'dart:async' })).toHaveCount(0);
    await stack.getByRole('button', { name: 'package:shop/cart.dart:12:5' }).click();
    await expect(page.getByRole('status')).toHaveText('Sent app/lib/cart.dart:12 to the IDE.');
    expect(vm.callsTo('lookupResolvedPackageUris')).toEqual([
      { isolateId: 'isolates/1', uris: ['package:shop/cart.dart'], local: true },
    ]);
    expect(vm.callsTo('postEvent')).toEqual([
      {
        stream: 'ToolEvent',
        eventKind: 'navigate',
        eventData: { fileUri: 'file:///app/lib/cart.dart', line: 12, column: 5, source: 'devpul' },
      },
    ]);
  });
});

test('copies a widget location when no IDE listens', async ({ page, vm, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await connect(page, vm);
  await page.getByRole('tab', { name: /^Errors/ }).click();
  await page.getByRole('row', { name: /Bad state: layout/ }).click();
  const widget = page.getByRole('complementary', { name: 'Detail' }).locator('section', { hasText: 'Widget' }).first();
  await widget.getByRole('button', { name: /contract_test\.dart:51:64/ }).click();
  await expect(page.getByRole('status')).toHaveText('No IDE is attached. Copied /app/test/contract_test.dart:51:64.');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('/app/test/contract_test.dart:51:64');
  expect(vm.callsTo('postEvent')).toHaveLength(1);
});

test('runs as a DevTools extension', async ({ page, vm, context }) => {
  const dtd = await FakeDtd.start();
  // DevTools serves extensions from its own origin and frames them.
  await page.goto('./docs/');
  await page.evaluate(
    ({ uri, dtdUri }) => {
      const frame = document.createElement('iframe');
      frame.src = `../index.html?uri=${encodeURIComponent(uri)}&theme=dark&dtdUri=${encodeURIComponent(dtdUri)}`;
      frame.style.cssText = 'position: fixed; inset: 0; z-index: 1000; width: 1200px; height: 700px';
      document.body.append(frame);
      window.addEventListener('message', (e) => document.body.append(`|${JSON.stringify(e.data)}`));
    },
    { uri: vm.url.replace('http://', 'ws://') + 'ws', dtdUri: dtd.url },
  );
  const ext = page.frameLocator('iframe');
  await expect(ext.getByRole('list', { name: 'Connections' })).toContainText('Shop');
  await expect(ext.getByRole('textbox', { name: 'VM service URL' })).toHaveCount(0);
  await expect(ext.locator('html')).toHaveAttribute('data-theme', 'dark');
  await ext.getByRole('button', { name: 'More' }).click();
  await expect(ext.getByRole('menuitem', { name: 'Help' })).toHaveAttribute('href', `${site.url}docs/help/`);
  await expect(ext.getByRole('menuitemradio')).toHaveCount(0);
  await page.keyboard.press('Escape');

  const [popup] = await Promise.all([
    context.waitForEvent('page'),
    ext.getByRole('button', { name: 'Open in window' }).click(),
  ]);
  await expect(popup.getByRole('list', { name: 'Connections' })).toContainText('Shop');
  await expect(popup.getByRole('button', { name: 'Connect another app' })).toBeVisible();
  await popup.close();

  await page.evaluate(() => {
    const target = document.querySelector('iframe')?.contentWindow;
    target?.postMessage({ type: 'themeUpdate', data: { theme: 'light' } }, location.origin);
    target?.postMessage({ type: 'ping' }, location.origin);
  });
  await expect(ext.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('body')).toContainText('|{"type":"pong"}');

  await ext.getByRole('row', { name: /example\.com\/items/ }).click();
  await ext.getByRole('button', { name: 'curl' }).click();
  await expect(page.locator('body')).toContainText('|{"type":"copyToClipboard","data":{"content":"curl ');
  await expect(ext.getByRole('button', { name: 'Copied' })).toBeVisible();

  vm.emit('error', CART_ERROR);
  await ext.getByRole('tab', { name: /^Errors/ }).click();
  await ext.getByRole('row', { name: /Bad state: cart/ }).click();
  await ext.getByRole('button', { name: 'package:shop/cart.dart:12:5' }).click();
  await expect(ext.getByRole('status')).toHaveText('Opened app/lib/cart.dart:12 in the editor.');
  expect(dtd.calls).toEqual([
    { method: 'Editor.navigateToCode', params: { uri: 'file:///app/lib/cart.dart', line: 12, column: 5 } },
  ]);
  expect(vm.callsTo('postEvent')).toEqual([]);
  await dtd.close();
});

test('site pages load under their CSP', async ({ page }) => {
  for (const path of ['docs/', 'docs/help/', 'plugins/', 'plugins/cart/']) {
    await page.goto(`./${path}`);
    await expect(page.locator('h1')).toBeVisible();
  }
  await page.goto('./help/');
  await expect(page).toHaveURL(/\/docs\/help\/$/);
});

test('copies a plugin install command', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./plugins/cart/');
  await page.getByRole('button', { name: 'Copy devpul add cart' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('devpul add cart');
});

test('lands on the site with setup steps and links the docs next to the app', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('./');
  await expect(page.getByRole('link', { name: 'Help' })).toHaveAttribute('href', './docs/help/');
  await expect(page.getByRole('link', { name: 'Get started' })).toHaveAttribute('href', './docs/');
  await expect(page.getByRole('region', { name: 'Set up' })).toContainText('dart pub global activate devpul_cli');
  await page.getByRole('button', { name: 'Copy', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('dart pub global activate devpul_cli');
  await expect(page.getByText('Dart 3.13 and older')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'VM service URL' })).not.toBeFocused();
  const shot = page.getByRole('img', { name: /^DevPul connected/ }).first();
  await expect(shot).toHaveJSProperty('complete', true);
  expect(await shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1440);
});

const lastSet = (vm: FakeVm) => {
  const call = vm
    .callsTo('ext.devpul.call')
    .filter((p) => p.name === 'http.mocks.set')
    .at(-1);
  return (JSON.parse(String(call?.args)) as { rules: Record<string, unknown>[] }).rules;
};

test.describe('with mock handlers', () => {
  // The app posts http.mocks when its rules change; the handler needs the test's VM for that.
  let app: FakeVm | undefined;
  test.use({
    vmOptions: {
      handlers: {
        'http.mocks.set': (args) => {
          app?.emit('http.mocks', { rules: args.rules ?? [] });
          return { rules: args.rules ?? [] };
        },
        'http.resume': () => null,
      },
    },
  });

  test('makes a rule from a request and turns it off and on', async ({ page, vm }) => {
    app = vm;
    await connect(page, vm);
    await page.getByRole('row', { name: /example\.com\/items/ }).click();
    await page
      .getByRole('complementary', { name: 'Request detail' })
      .getByRole('button', { name: 'Mock', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Mocks' });
    const form = dialog.getByRole('form', { name: 'Mock rule' });
    await expect(form.getByLabel(/^URL/)).toHaveValue('https://example.com/items?page=1&tag=a&tag=b');
    await expect(form.getByLabel('Body')).toHaveValue('{\n  "ok": true\n}');
    await form.getByLabel('Status').fill('503');
    await form.getByRole('button', { name: 'Save rule' }).click();
    await expect(dialog.getByRole('list', { name: 'Mock rules' })).toContainText('respond 503');
    expect(lastSet(vm)).toEqual([
      expect.objectContaining({
        on: true,
        method: 'POST',
        url: 'https://example.com/items?page=1&tag=a&tag=b',
        mode: 'respond',
        status: 503,
        headers: { 'content-type': 'application/json' },
        body: '{\n  "ok": true\n}',
      }),
    ]);

    await dialog.getByRole('switch').click();
    await expect.poll(() => lastSet(vm)[0]?.on).toBe(false);
    await page.keyboard.press('Escape');
    const status = page.getByRole('contentinfo');
    await expect(status.getByRole('button', { name: /mock/ })).toHaveCount(0);
    await page.getByRole('button', { name: 'Mocks' }).click();
    await dialog.getByRole('switch').click();
    await page.keyboard.press('Escape');
    await expect(status.getByRole('button', { name: '1 mock' })).toBeVisible();
  });

  test('edits a paused request and lets it go', async ({ page, vm }) => {
    app = vm;
    await connect(page, vm);
    vm.emit('http.paused', {
      id: 99,
      stage: 'request',
      method: 'POST',
      url: 'https://example.com/pay',
      headers: { 'content-type': 'application/json' },
      body: '{"n":1}',
      editable: true,
      json: true,
      timeoutMs: 300_000,
    });
    const status = page.getByRole('contentinfo');
    await status.getByRole('button', { name: '1 paused' }).click();
    const breakpoint = page.getByRole('region', { name: 'Breakpoint' });
    await expect(breakpoint).toContainText('Paused before sending');
    const body = breakpoint.getByLabel(/^Body/);
    await body.fill('{"n":');
    await breakpoint.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect(breakpoint).toContainText('The body is not valid JSON.');
    await body.fill('{"n":2}');
    await breakpoint.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect
      .poll(() =>
        vm
          .callsTo('ext.devpul.call')
          .filter((p) => p.name === 'http.resume')
          .map((p) => p.args),
      )
      .toEqual([JSON.stringify({ id: 99, body: '{"n":2}' })]);
    vm.emit('http.resumed', { id: 99, how: 'resumed' });
    await expect(breakpoint).toHaveCount(0);
    await expect(status.getByRole('button', { name: /paused/ })).toHaveCount(0);
  });
});

test.describe('with replay handlers', () => {
  let app: FakeVm | undefined;
  test.use({
    vmOptions: {
      handlers: {
        // The app answers with the id as it sent it, a number here.
        'http.sent': (args) => ({
          id: Number(args.id),
          method: 'POST',
          url: 'https://example.com/pay',
          headers: {},
          body: '{"total":42}',
          editable: true,
        }),
        'http.replay': (args) => {
          app?.emit('http.request', {
            id: 77,
            method: 'POST',
            url: 'https://example.com/pay',
            cause: { type: 'replay', id: args.id ?? null },
          });
          return { id: 77 };
        },
      },
    },
  });

  test('shows what started a request, replays it edited and links back', async ({ page, vm }) => {
    app = vm;
    await connect(page, vm);
    await page.getByRole('row', { name: /502/ }).click();
    const detail = page.getByRole('complementary', { name: 'Request detail' });
    const cause = detail.getByRole('button', { name: /cart\.checkout/ });
    await expect(cause).toContainText('items: 2');
    await expect(page.getByRole('row', { name: /started by cart\.checkout/ })).toContainText('502');
    await cause.click();
    const event = page.getByRole('complementary', { name: 'Detail' });
    await expect(event).toContainText('cart.checkout');
    await event.getByRole('button', { name: /#6 POST 502/ }).click();
    await expect(detail.getByRole('button', { name: /cart\.checkout/ })).toBeVisible();
    await page.getByLabel('Filter requests').fill('cause:cart');
    await expect(page.getByRole('row', { name: /https:/ })).toHaveCount(1);
    await page.getByLabel('Filter requests').fill('');

    await detail.getByRole('button', { name: 'Replay' }).click();
    const form = page.getByRole('region', { name: 'Replay' });
    await form.getByLabel(/^Body/).fill('{"total":43}');
    await form.getByRole('button', { name: 'Send' }).click();
    await expect
      .poll(() =>
        vm
          .callsTo('ext.devpul.call')
          .filter((p) => p.name === 'http.replay')
          .map((p) => p.args),
      )
      .toEqual([JSON.stringify({ id: 6, body: '{"total":43}' })]);
    await expect(detail).toContainText('#77');
    await expect(page.getByRole('row', { name: /^77 replay of #6/ })).toBeVisible();
    await detail.getByRole('button', { name: /replay of #6/ }).click();
    await expect(detail.getByRole('button', { name: /cart\.checkout/ })).toBeVisible();
  });
});

test.describe('with bug report handlers', () => {
  const contract = (file: string) =>
    JSON.parse(readFileSync(join(import.meta.dirname, '../../../contract', file), 'utf8')) as JsonObject;
  const info = contract('info.json');
  const pixel =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  test.use({
    vmOptions: {
      handlers: {
        'flutter.screenshot': () => ({ image: pixel, width: 1, height: 1 }),
        'flutter.device': () => contract('device.json'),
      },
    },
  });

  test('saves the screenshot and device with the events and shows them from the file', async ({ page, vm }) => {
    await connect(page, vm);
    // As devpul_flutter's install() adds its handlers after the first handshake.
    const handlers = [...(info.handlers as JsonObject[]), { name: 'flutter.screenshot' }, { name: 'flutter.device' }];
    vm.emit('app.info', { ...info, handlers });
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Bug report' }).click();
    const dialog = page.getByRole('dialog', { name: 'Bug report' });
    await expect(dialog.getByRole('img', { name: 'Screenshot of the app' })).toBeVisible();
    await expect(dialog).toContainText('360 x 800 at 3x');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      dialog.getByRole('button', { name: 'Save report' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^devpul-report-.*\.devpul\.json$/);
    const path = await download.path();
    const file = JSON.parse(readFileSync(path, 'utf8')) as { events: unknown[]; report: JsonObject };
    expect(file.events.length).toBeGreaterThan(10);
    expect(file.report).toMatchObject({ screenshot: { image: pixel }, device: contract('device.json') });
    await expect(dialog).toBeHidden();

    await page.locator('input[type=file]').setInputFiles(path);
    await expect(dialog).toContainText('Shop 2.3.1');
    await expect(dialog).toContainText('Android 15');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'More' }).click();
    await page.getByRole('menuitem', { name: 'Opened bug report' }).click();
    await expect(dialog.getByRole('img', { name: 'Screenshot of the app' })).toBeVisible();
  });
});
