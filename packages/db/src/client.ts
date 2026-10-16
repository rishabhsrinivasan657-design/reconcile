import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv, postgresUrl } from '@reconcile/core';
import { z } from 'zod';
import { PrismaClient } from './generated/prisma/client.ts';

/** Create a Prisma client using the Postgres driver adapter (Prisma 7). */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? loadEnv(z.object({ DATABASE_URL: postgresUrl })).DATABASE_URL;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
