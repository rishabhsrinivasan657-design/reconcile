import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrismaClient } from '@reconcile/db';
import { FileCacheStore, LlmClient, LlmEnv } from '@reconcile/llm';
import { Redis } from 'ioredis';
import { LocalStorage } from '../src/storage.ts';

export const root = path.resolve(import.meta.dirname, '../../..');
export const goldenDir = path.join(root, 'evals/golden-ci');
export const testDbUrl = process.env.DATABASE_URL_TEST;
export const redisUrl =
  process.env.REDIS_URL_TEST ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
export const hasInfra = Boolean(testDbUrl);

export const db = () => createPrismaClient(testDbUrl!);
export const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-pipeline-'));
export const storage = () => new LocalStorage(tmp());

/** The real LLM client, replaying recorded answers from evals/cache: no key, no cost. */
export const replayLlm = () =>
  new LlmClient({
    env: LlmEnv.parse({ LLM_CACHE_DIR: tmp() }),
    cache: new FileCacheStore(path.join(root, 'evals/cache')),
    mode: 'replay',
  });

/** Empty every table (TRUNCATE is allowed on the append-only audit table). */
export async function reset(client: ReturnType<typeof db>) {
  await client.$executeRawUnsafe(
    'TRUNCATE "AuditEvent","LlmCall","ExceptionActionRecord","Exception","LineMatch","MatchRun","Extraction","Document","DocumentSet","CatalogItem","Vendor","User" RESTART IDENTITY CASCADE',
  );
}

export const goldenFile = (setId: string, role: string) => {
  const f = fs.readdirSync(path.join(goldenDir, setId)).find((x) => x.startsWith(`${role}.`))!;
  return new Uint8Array(fs.readFileSync(path.join(goldenDir, setId, f)));
};
export const truthOf = (setId: string) =>
  JSON.parse(fs.readFileSync(path.join(goldenDir, setId, 'ground_truth.json'), 'utf8'));

export const redis = () => new Redis(redisUrl, { maxRetriesPerRequest: null });
