// Writes the screenshots in apps/docs/public/screenshots as webp, light and dark:
// stills of the main views and an animation of a session (cwebp and img2webp on
// PATH), then copies the files each package's pubspec lists into that package.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { chromium, type Locator, type Page } from '@playwright/test';
import { preview } from 'vite';
import { backlog, session, start, vmOptions } from './scene.ts';
import { FakeVm } from './vm.ts';

const root = join(import.meta.dirname, '../../..');
const dir = join(root, 'apps/docs/public/screenshots');
const schemes = ['light', 'dark'] as const;
type Scheme = (typeof schemes)[number];

for (const tool of ['cwebp', 'img2webp']) {
  try {
    execFileSync(tool, ['-version'], { stdio: 'ignore' });
  } catch {
    console.error(`${tool} not found: install the libwebp tools.`);
    process.exit(1);
  }
}

rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });

const server = await preview({
  root: join(import.meta.dirname, '..'),
  logLevel: 'warn',
  preview: { host: '127.0.0.1', port: 4175 },
});
const base = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:4175/';
const browser = await chromium.launch();

const open = async (scheme: Scheme, deviceScaleFactor: number) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor,
    colorScheme: scheme,
    timezoneId: 'UTC',
  });
  const page = await context.newPage();
  await page.goto(base);
  return page;
};

const views: [string, (page: Page, vm: FakeVm) => Promise<void>][] = [
  ['home', async () => {}],
  [
    'http',
    async (page, vm) => {
      await page.getByLabel('VM service URL').fill(vm.url);
      await page.getByRole('button', { name: 'Connect' }).click();
      await page.getByRole('tab', { name: /^Plugins/ }).click();
      const allow = page.getByRole('region', { name: 'Plugins' }).getByRole('button', { name: 'Allow' });
      await allow.first().waitFor();
      while ((await allow.count()) > 0) await allow.first().click();
      await page.getByRole('tab', { name: /^SQLite/ }).waitFor();
      await page.getByRole('tab', { name: /^HTTP/ }).click();
      await page.getByRole('row', { name: /\/v1\/orders/ }).click();
    },
  ],
  [
    'errors',
    async (page) => {
      await page.getByRole('tab', { name: /^Errors/ }).click();
      await page.getByRole('row', { name: /FormatException/ }).click();
    },
  ],
  [
    'sqlite',
    async (page) => {
      await page.getByRole('tab', { name: /^SQLite/ }).click();
      await page.getByRole('button', { name: 'products', exact: true }).click();
      await page.getByText('Linen apron').waitFor();
    },
  ],
  ['plugins', (page) => page.getByRole('tab', { name: /^Plugins/ }).click()],
];

async function stills(scheme: Scheme) {
  const vm = await FakeVm.start(vmOptions(backlog()));
  const page = await open(scheme, 2);
  try {
    for (const [name, show] of views) {
      await show(page, vm);
      // No hover tooltips or focus rings; transitions settle.
      await page.mouse.move(0, 0);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.waitForTimeout(400);
      await shot(page, `${name}-${scheme}`);
    }
  } finally {
    await page.context().close();
    await vm.close();
  }
}

// Lossless: a third of the png's size, same pixels.
async function shot(page: Page, name: string) {
  const png = join(tmpdir(), `devpul-${name}.png`);
  const file = join(dir, `${name}.webp`);
  await page.screenshot({ path: png });
  execFileSync('cwebp', ['-quiet', '-lossless', '-z', '9', png, '-o', file]);
  rmSync(png);
  console.log(file);
}

// A pointer drawn into the page, since screenshots leave the real one out.
const POINTER = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

/** Frames of a session: connect, requests arriving, a request opened, an error. */
async function animation(scheme: Scheme) {
  const first = start();
  const vm = await FakeVm.start(vmOptions(first));
  const page = await open(scheme, 1);
  const frames = mkdtempSync(join(tmpdir(), 'devpul-frames-'));
  const list: [string, number][] = [];
  let at = { x: 900, y: 500 };

  const frame = async (ms: number) => {
    const png = await page.screenshot();
    const last = list.at(-1);
    if (last && readFileSync(last[0]).equals(png)) {
      last[1] += ms;
      return;
    }
    const file = join(frames, `${String(list.length).padStart(3, '0')}.png`);
    writeFileSync(file, png);
    list.push([file, ms]);
  };
  const point = (x: number, y: number) =>
    page.evaluate(
      ([svg, left, top]) => {
        let el = document.getElementById('shot-pointer');
        if (!el) {
          el = document.createElement('div');
          el.id = 'shot-pointer';
          el.innerHTML = svg;
          Object.assign(el.style, { position: 'fixed', zIndex: '2147483647', pointerEvents: 'none' });
          document.body.append(el);
        }
        Object.assign(el.style, { left: `${left - 4}px`, top: `${top - 2}px` });
      },
      [POINTER, x, y] as const,
    );
  const click = async (target: Locator) => {
    const box = (await target.boundingBox())!;
    const to = { x: box.x + Math.min(box.width / 2, 60), y: box.y + box.height / 2 };
    for (const t of [0.25, 0.55, 0.8, 1]) {
      await point(at.x + (to.x - at.x) * t, at.y + (to.y - at.y) * t);
      await frame(60);
    }
    at = to;
    await frame(240);
    await target.click();
    await page.mouse.move(0, 0);
    await point(at.x, at.y);
  };

  try {
    await point(at.x, at.y);
    await frame(1200);
    await page.getByLabel('VM service URL').fill(vm.url);
    await frame(500);
    await click(page.getByRole('button', { name: 'Connect' }));
    // The offers are for the stills; the animation shows the core tabs.
    const notNow = page.getByRole('alert').getByRole('button', { name: 'Not now' });
    await notNow.first().waitFor();
    while ((await notNow.count()) > 0) await notNow.first().click();
    await frame(600);
    const steps = session(first.length);
    for (const events of steps.slice(0, -1)) {
      for (const e of events) vm.post(e);
      await page.waitForTimeout(120);
      await frame(events.length > 1 ? 450 : 250);
    }
    await frame(800);
    await click(page.getByRole('row', { name: /\/v1\/orders/ }));
    await page.waitForTimeout(200);
    await frame(2200);
    for (const e of steps.at(-1)!) vm.post(e);
    await page.waitForTimeout(150);
    await frame(900);
    await click(page.getByRole('tab', { name: /^Errors/ }));
    await page.waitForTimeout(150);
    await frame(500);
    await click(page.getByRole('row', { name: /FormatException/ }));
    await page.waitForTimeout(200);
    await frame(3000);

    const file = join(dir, `session-${scheme}.webp`);
    const args = ['-loop', '0', '-mixed', '-q', '80', '-m', '6'];
    for (const [png, ms] of list) args.push('-d', String(ms), png);
    execFileSync('img2webp', [...args, '-o', file], { stdio: 'inherit' });
    console.log(file);
  } finally {
    await page.context().close();
    await vm.close();
    rmSync(frames, { recursive: true, force: true });
  }
}

try {
  for (const scheme of schemes) {
    await stills(scheme);
    await animation(scheme);
  }
  // Pub ships screenshots from inside the package.
  for (const pkg of readdirSync(join(root, 'packages'))) {
    const pubspec = readFileSync(join(root, 'packages', pkg, 'pubspec.yaml'), 'utf8');
    rmSync(join(root, 'packages', pkg, 'screenshots'), { recursive: true, force: true });
    for (const [, path] of pubspec.matchAll(/^\s+path: (screenshots\/\S+)$/gm)) {
      mkdirSync(join(root, 'packages', pkg, 'screenshots'), { recursive: true });
      copyFileSync(join(dir, basename(path!)), join(root, 'packages', pkg, path!));
      console.log(join('packages', pkg, path!));
    }
  }
} finally {
  await browser.close();
  await server.close();
}
