import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 does not auto-load .env; load the repo-root one if present (CI sets env directly).
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed.ts',
  },
  // Optional so `prisma generate` works without a database (e.g. CI lint job, postinstall).
  // Commands that need a DB (migrate, seed) fail with Prisma's own message if it's missing.
  ...(process.env.DATABASE_URL ? { datasource: { url: process.env.DATABASE_URL } } : {}),
});
