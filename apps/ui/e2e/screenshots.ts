// Writes light and dark screenshots of the main views: npm run screenshots -- <dir>
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { preview } from 'vite';
import { FakeVm } from './vm.ts';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: npm run screenshots -- <dir>');
  process.exit(64);
}
// npm runs scripts in apps/ui; the path is relative to where npm was started.
const dir = resolve(process.env.INIT_CWD ?? '.', arg);
mkdirSync(dir, { recursive: true });

const server = await preview({
  root: join(import.meta.dirname, '..'),
  logLevel: 'warn',
  preview: { host: '127.0.0.1', port: 4175 },
});
const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4175/';
const vm = await FakeVm.start();
const browser = await chromium.launch();

const views: [string, (page: Page) => Promise<void>][] = [
  [
    'home',
    async (page) => {
      await page.goto(base);
    },
  ],
  [
    'http',
    async (page) => {
      await page.getByLabel('VM service URL').fill(vm.url);
      await page.getByRole('button', { name: 'Connect' }).click();
      await page.getByRole('alert').getByRole('button', { name: 'Allow' }).click();
      await page.getByRole('row', { name: /example\.com\/items/ }).click();
    },
  ],
  [
    'errors',
    async (page) => {
      await page.getByRole('tab', { name: /^Errors/ }).click();
      await page.getByRole('row', { name: /Bad state: boom/ }).click();
    },
  ],
  ['logs', (page) => page.getByRole('tab', { name: /^Logs/ }).click()],
  [
    'events',
    async (page) => {
      await page.getByRole('tab', { name: /^Events/ }).click();
      await page.getByRole('row', { name: /route/ }).first().click();
    },
  ],
  [
    'plugin',
    async (page) => {
      await page.getByRole('tab', { name: /^Cart/ }).click();
      await page.getByRole('row').first().click();
    },
  ],
  ['plugins', (page) => page.getByRole('tab', { name: /^Plugins/ }).click()],
  ['settings', (page) => page.getByRole('button', { name: 'Settings' }).click()],
];

try {
  for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
      colorScheme,
      timezoneId: 'UTC',
    });
    const page = await context.newPage();
    for (const [name, show] of views) {
      await show(page);
      // No hover tooltips or autofocus rings; transitions settle.
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(400);
      const file = join(dir, `${name}-${colorScheme}.png`);
      await page.screenshot({ path: file });
      console.log(file);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await vm.close();
  await server.close();
}
