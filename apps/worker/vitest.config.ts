import fs from 'node:fs';
import path from 'node:path';
import { defineProject } from 'vitest/config';

const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineProject({
  test: {
    name: '@reconcile/worker',
    globalSetup: ['../../packages/db/test/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 60_000,
  },
});
