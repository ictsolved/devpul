import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connect, expect, test } from './fixtures.ts';
import { FakeDtd, fixtureEvents, PLUGIN } from './vm.ts';

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
  await request.getByRole('button', { name: 'Back to error' }).click();
  await expect(page.getByRole('tab', { name: /^Errors/ })).toHaveAttribute('aria-selected', 'true');

  await crumbs.getByRole('button', { name: /Sync failed/ }).click();
  await expect(page.getByRole('tab', { name: /^Logs/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('row', { name: /Sync failed/ })).toHaveAttribute('aria-selected', 'true');
  await detail.getByRole('button', { name: 'Back to error' }).click();
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
  await page.getByRole('button', { name: 'Settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Settings' });
  await expect(dialog).toContainText(`In memory: ${vm.events.length} events`);
  await dialog.getByLabel('Amber from (ms)').fill('250');

  await dialog.getByRole('checkbox', { name: 'Mute log' }).click();
  await expect
    .poll(() => vm.callsTo('ext.devpul.limit'))
    .toEqual([{ isolateId: 'isolates/1', kind: 'log', perSecond: '0' }]);
  await expect(dialog.getByRole('checkbox', { name: 'Mute log' })).toBeChecked();
  await expect(dialog.getByRole('textbox', { name: 'log per second' })).toBeDisabled();

  await page.keyboard.press('Escape');
  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('dialog').getByLabel('Amber from (ms)')).toHaveValue('250');
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
  await expect(page.getByRole('complementary', { name: 'Detail' })).toContainText('42.5');
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
  await page.getByRole('button', { name: 'Plugins', exact: true }).click();
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

test('runs as a DevTools extension', async ({ page, vm }) => {
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
  await expect(ext.getByRole('button', { name: /^Theme/ })).toHaveCount(0);
  await expect(ext.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(ext.getByRole('link', { name: 'Help' })).toHaveAttribute('href', `${site.url}docs/help/`);

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

test('links the docs next to the app', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('link', { name: 'Help' })).toHaveAttribute('href', './docs/help/');
});
