import { createPrismaClient } from '../src/client.ts';

export const testDbUrl = process.env.DATABASE_URL_TEST;
export const hasTestDb = Boolean(testDbUrl);

export function testClient() {
  if (!testDbUrl) throw new Error('DATABASE_URL_TEST is not set');
  return createPrismaClient(testDbUrl);
}
