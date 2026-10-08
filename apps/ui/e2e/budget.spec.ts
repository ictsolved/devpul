import type { Page } from '@playwright/test';
import { connect, expect, test } from './fixtures.ts';
import { loadEvents } from './vm.ts';

const events = loadEvents(10_000, 5 * 1024 * 1024);
test.use({ vmOptions: { events } });

const MB = 1024 * 1024;

declare global {
  interface Window {
    longTasks: number[];
    frameLog?: { deltas: number[]; on: boolean };
  }
}

/** Frame times while `interact` runs, from requestAnimationFrame. */
async function frames(page: Page, interact: () => Promise<void>): Promise<{ p95: number; max: number }> {
  await page.evaluate(() => {
    const log = { deltas: [] as number[], on: true };
    window.frameLog = log;
    let last = performance.now();
    const tick = (t: number) => {
      log.deltas.push(t - last);
      last = t;
      if (log.on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await interact();
  const deltas = await page.evaluate(() => {
    window.frameLog!.on = false;
    return window.frameLog!.deltas.toSorted((a, b) => a - b);
  });
  return { p95: round(deltas[Math.floor(deltas.length * 0.95)]), max: round(deltas.at(-1)) };
}

const round = (n = 0) => Math.round(n);

const storedEvents = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('devpul');
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('events')) return resolve(0);
          const count = db.transaction('events').objectStore('events').count();
          count.onsuccess = () => {
            db.close();
            resolve(count.result);
          };
        };
      }),
  );

test('10k events and a 5 MB body stay within the frame and memory budget', async ({ page, vm }) => {
  await page.addInitScript(() => {
    window.longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.longTasks.push(e.duration);
    }).observe({ type: 'longtask', buffered: true });
  });
  const requests = events.filter((e) => e.kind === 'devpul.http.request').length;
  const started = Date.now();
  await connect(page, vm);
  const grid = page.getByRole('grid', { name: 'Requests' });
  // The header row counts too.
  await expect(grid).toHaveAttribute('aria-rowcount', String(requests + 1));
  const ingestMs = Date.now() - started;
  // Frames are timed after the IndexedDB write.
  await expect.poll(() => storedEvents(page), { timeout: 15_000 }).toBe(events.length);
  const longestTask = round(Math.max(0, ...(await page.evaluate(() => window.longTasks))));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapMB = Math.round((await cdp.send('Runtime.getHeapUsage')).usedSize / MB);

  await grid.hover();
  const firstRow = grid.locator('[aria-rowindex="2"]');
  const scroll = await frames(page, async () => {
    for (const dy of [800, -800]) {
      for (let i = 0; i < 30; i++) {
        await page.mouse.wheel(0, dy);
        await page.waitForTimeout(30);
      }
      await expect(firstRow).toHaveCount(dy > 0 ? 0 : 1);
    }
  });

  const tabs = await frames(page, async () => {
    for (let i = 0; i < 3; i++) {
      for (const key of ['2', '3', '4', '1']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(150);
      }
    }
  });

  console.log(JSON.stringify({ ingestMs, longestTask, heapMB, scroll, tabs }));
  // Measured on a laptop: 700 ms, 140 ms, 16 MB, frames 17 ms, tab switch up to 33 ms.
  // With the CPU throttled 4x: 2100 ms, 470 ms, frames 33 ms, tab switch up to 83 ms.
  expect.soft(ingestMs, 'connect to all rows, ms').toBeLessThan(4000);
  expect.soft(longestTask, 'longest task while ingesting and storing, ms').toBeLessThan(800);
  expect.soft(heapMB, 'JS heap after GC, MB').toBeLessThan(40);
  expect.soft(scroll.p95, 'scroll frame p95, ms').toBeLessThan(50);
  expect.soft(scroll.max, 'scroll frame max, ms').toBeLessThan(100);
  expect.soft(tabs.p95, 'tab switch frame p95, ms').toBeLessThan(50);
  expect.soft(tabs.max, 'tab switch frame max, ms').toBeLessThan(200);
});
