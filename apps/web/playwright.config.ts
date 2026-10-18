import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * The one browser test (M5 AC-12). It runs the whole stack on its own ports, database, Redis
 * database, and storage folder, with recorded AI answers: no key, no cost, and it can run while
 * `pnpm dev` is up.
 */
const root = path.resolve(import.meta.dirname, '../..');
if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
const API = 3101;
const WEB = 3100;
const env = {
  ...process.env,
  DATABASE_URL:
    process.env.DATABASE_URL_E2E ??
    process.env.DATABASE_URL_TEST ??
    'postgresql://reconcile:reconcile@localhost:5432/reconcile_test',
  REDIS_URL: process.env.REDIS_URL_E2E ?? 'redis://localhost:6379/2',
  STORAGE_DIR: path.join(os.tmpdir(), 'reconcile-e2e-storage'),
  API_PORT: String(API),
  API_URL: `http://localhost:${API}`,
  LLM_MODE: 'replay',
  LLM_ANSWER_CACHE_DIR: path.join(root, 'evals/cache'),
  MISSING_DOC_GRACE_DAYS: '0',
  NEXT_DIST_DIR: '.next-e2e',
};

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${WEB}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      // Fresh database and queues, then the API.
      command:
        'pnpm --filter @reconcile/api exec tsx src/e2e-prepare.ts && pnpm --filter @reconcile/api start',
      url: `http://localhost:${API}/health`,
      env,
      timeout: 120_000,
      reuseExistingServer: false,
    },
    {
      // The worker has no port to wait for; the test waits for its results instead.
      command: 'pnpm --filter @reconcile/worker start',
      env,
    },
    {
      command: `pnpm build && pnpm exec next start --port ${WEB}`,
      url: `http://localhost:${WEB}`,
      env,
      timeout: 300_000,
      reuseExistingServer: false,
    },
  ],
});
