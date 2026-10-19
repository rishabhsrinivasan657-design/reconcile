import { defineConfig, devices } from '@playwright/test';

/**
 * The live smoke test (M7 AC-11): runs against the deployed site, with no local servers.
 * `pnpm deploy:smoke` (or the end of `pnpm deploy:up`) sets LIVE_URL and DEMO_PASSWORD.
 */
const url = process.env.LIVE_URL;
if (!url) throw new Error('Set LIVE_URL (pnpm deploy:smoke does this for you).');

export default defineConfig({
  testDir: 'e2e',
  testMatch: 'live-smoke.spec.ts',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: url,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
});
