import fs from 'node:fs';
import path from 'node:path';
import { defineProject } from 'vitest/config';

const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineProject({
  test: {
    name: '@reconcile/db',
    globalSetup: ['./test/global-setup.ts'],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
