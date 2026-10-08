import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: { ...devices['Desktop Chrome'], baseURL: `http://127.0.0.1:${PORT}/` },
  projects: [
    { name: 'smoke', testMatch: 'smoke.spec.ts', fullyParallel: true },
    // After the smoke tests, so no other test shares the CPU while frames are timed.
    { name: 'budget', testMatch: 'budget.spec.ts', dependencies: ['smoke'] },
  ],
  webServer: {
    command: `vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: !process.env.CI,
  },
});
