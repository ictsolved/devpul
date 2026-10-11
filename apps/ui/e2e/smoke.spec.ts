import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGES } from '../pages/render.ts';
import { connect, expect, test } from './fixtures.ts';
import { fixtureEvents, PLUGIN } from './vm.ts';

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
  await expect(errors.getByRole('row', { name: /Bad state: layout/ })).toBeVisible();

  await page.getByRole('tab', { name: /^Logs/ }).click();
  const logs = page.getByRole('grid', { name: 'Logs' });
  await expect(logs.getByRole('row', { name: /Signed in/ })).toBeVisible();
  await expect(logs.getByRole('row', { name: /Sync failed/ })).toBeVisible();

  await page.getByRole('tab', { name: /^Events/ }).click();
  const events = page.getByRole('grid', { name: 'Events' });
  for (const kind of ['cart.updated', 'big', 'route']) {
    await expect(events.getByRole('row', { name: new RegExp(kind) }).first()).toBeVisible();
  }
  await expect(events.getByRole('row', { name: /route/ })).toHaveCount(4);
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

test('opens a request from an error and goes back to the error', async ({ page, vm }) => {
  await connect(page, vm);
  await page.getByRole('tab', { name: /^Errors/ }).click();
  await page.getByRole('row', { name: /Bad state: boom/ }).click();
  const detail = page.getByRole('complementary', { name: 'Detail' });
  await expect(detail).toContainText('while syncing');
  await detail.getByRole('button', { name: /example\.com\/upload/ }).click();

  await expect(page.getByRole('tab', { name: /^HTTP/ })).toHaveAttribute('aria-selected', 'true');
  const request = page.getByRole('complementary', { name: 'Request detail' });
  await expect(request).toContainText('https://example.com/upload');
  await request.getByRole('button', { name: 'Back to error' }).click();

  await expect(page.getByRole('tab', { name: /^Errors/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('complementary', { name: 'Detail' })).toContainText('Bad state: boom');
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
      b.onclick = () => run().then((r) => (out.textContent = JSON.stringify(r)), (e) => (out.textContent = e.message ?? e.data.details));
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
  const { registry } = JSON.parse(readFileSync(join(import.meta.dirname, '../../../site.json'), 'utf8')) as {
    registry: string;
  };
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

test('runs as a DevTools extension', async ({ page, vm }) => {
  // DevTools serves extensions from its own origin and frames them.
  await page.goto('./help/');
  await page.evaluate(
    (uri) => {
      const frame = document.createElement('iframe');
      frame.src = `../index.html?uri=${encodeURIComponent(uri)}&theme=dark&dtdUri=ws%3A%2F%2F127.0.0.1%3A1%2Fx`;
      frame.style.cssText = 'width: 1200px; height: 700px';
      document.body.append(frame);
      window.addEventListener('message', (e) => document.body.append(`|${JSON.stringify(e.data)}`));
    },
    vm.url.replace('http://', 'ws://') + 'ws',
  );
  const ext = page.frameLocator('iframe');
  await expect(ext.getByRole('list', { name: 'Connections' })).toContainText('Shop');
  await expect(ext.getByRole('textbox', { name: 'VM service URL' })).toHaveCount(0);
  await expect(ext.getByRole('button', { name: /^Theme/ })).toHaveCount(0);
  await expect(ext.locator('html')).toHaveAttribute('data-theme', 'dark');

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
});

test('static pages load under the CSP', async ({ page }) => {
  for (const { path } of PAGES) {
    await page.goto(`./${path}`);
    await expect(page.locator('h1')).toBeVisible();
  }
});
