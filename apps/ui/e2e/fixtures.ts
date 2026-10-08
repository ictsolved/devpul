import { expect, type Page, test as base } from '@playwright/test';
import { FakeVm, type VmOptions } from './vm.ts';

interface Fixtures {
  vmOptions: VmOptions;
  vm: FakeVm;
}

/** Every test fails on a page error, a console error or a CSP violation. */
export const test = base.extend<Fixtures>({
  vmOptions: [{}, { option: true }],
  vm: async ({ vmOptions }, use) => {
    const vm = await FakeVm.start(vmOptions);
    await use(vm);
    await vm.close();
  },
  // Depends on vm so the VM outlives the page and a closed socket logs nothing.
  page: async ({ page, vm: _vm }, use) => {
    const problems: string[] = [];
    page.on('pageerror', (e) => problems.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(m.text());
    });
    await page.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (e) =>
        console.error(`CSP violation: ${e.violatedDirective} ${e.blockedURI}`),
      ),
    );
    await use(page);
    expect(problems).toEqual([]);
  },
});

export { expect };

export async function connect(page: Page, vm: FakeVm): Promise<void> {
  await page.goto(`./#connect=${encodeURIComponent(vm.url)}`);
  await expect(page.getByRole('tab', { name: /^HTTP/ })).toBeVisible();
}
