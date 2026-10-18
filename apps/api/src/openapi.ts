/**
 * Print the API's OpenAPI manual without starting a server or touching the database.
 * The website generates its typed client from this (ADR-0012): `pnpm --filter @reconcile/web api:types`.
 */
import { createPrismaClient } from '@reconcile/db';
import { LocalStorage } from '@reconcile/pipeline';
import { buildApp } from './app.ts';

// Nothing connects: Prisma connects lazily and no route is called.
const app = await buildApp({
  db: createPrismaClient('postgresql://unused@localhost/unused'),
  storage: new LocalStorage('/nonexistent'),
  queues: { enqueueRead: async () => undefined, enqueueMatch: async () => undefined } as never,
});
await app.ready();
process.stdout.write(JSON.stringify(app.swagger(), null, 2) + '\n');
await app.close();
