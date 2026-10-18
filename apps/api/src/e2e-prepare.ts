/** Before the browser test (apps/web/e2e): migrate and empty the test database, seed the user, clear the queues. */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createPrismaClient } from '@reconcile/db';
import { seed } from '@reconcile/db/seed';
import { Redis } from 'ioredis';

const url = process.env.DATABASE_URL!;
execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
  cwd: path.resolve(import.meta.dirname, '../../../packages/db'),
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'pipe',
});
const db = createPrismaClient(url);
await db.$executeRawUnsafe(
  'TRUNCATE "AuditEvent","LlmCall","ExceptionActionRecord","Exception","LineMatch","MatchRun","Extraction","Document","DocumentSet","CatalogItem","Vendor","User" RESTART IDENTITY CASCADE',
);
await seed(db);
await db.$disconnect();
const redis = new Redis(process.env.REDIS_URL!);
await redis.flushdb();
redis.disconnect();
fs.rmSync(process.env.STORAGE_DIR!, { recursive: true, force: true });
console.log('e2e: database, queues, and storage ready');
