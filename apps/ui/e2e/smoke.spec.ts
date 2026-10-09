import { PAGES } from '../pages/render.ts';
import { connect, expect, test } from './fixtures.ts';

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
