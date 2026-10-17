import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '@reconcile/api/src/app.ts';
import { createPrismaClient } from '@reconcile/db';
import { seed } from '@reconcile/db/seed';
import { FileCacheStore, LlmClient, LlmEnv } from '@reconcile/llm';
import { createQueues, LocalStorage, prismaSink } from '@reconcile/pipeline';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startWorkers } from '../src/workers.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const golden = path.join(root, 'evals/golden-ci');
const testDbUrl = process.env.DATABASE_URL_TEST;
// Redis database 1, so tests never touch a dev worker's queues on database 0.
const redisUrl = process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/1';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-full-'));

function multipart(bytes: Uint8Array, filename: string) {
  const boundary = '----reconcile' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  return {
    payload: Buffer.concat([head, Buffer.from(bytes), Buffer.from(`\r\n--${boundary}--\r\n`)]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe.skipIf(!testDbUrl)('full pipeline: API → queue → worker → API (M4 AC-11)', () => {
  const db = testDbUrl ? createPrismaClient(testDbUrl) : undefined!;
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queues = createQueues(connection);
  const storage = new LocalStorage(tmp());
  const events: string[] = [];
  let app: Awaited<ReturnType<typeof buildApp>>;
  let workers: ReturnType<typeof startWorkers>;

  beforeAll(async () => {
    await connection.flushdb();
    await db.$executeRawUnsafe(
      'TRUNCATE "AuditEvent","LlmCall","ExceptionActionRecord","Exception","LineMatch","MatchRun","Extraction","Document","DocumentSet","CatalogItem","Vendor","User" RESTART IDENTITY CASCADE',
    );
    await seed(db);
    const llm = new LlmClient({
      env: LlmEnv.parse({ LLM_CACHE_DIR: tmp() }),
      cache: new FileCacheStore(path.join(root, 'evals/cache')),
      mode: 'replay',
      sink: prismaSink(db),
    });
    app = await buildApp({ db, storage, queues, pingRedis: () => connection.ping() });
    workers = startWorkers({
      db,
      storage,
      llm,
      queues,
      connection,
      graceDays: 7,
      onEvent: (e) => events.push(`${e.job} ${e.ok ? 'ok' : 'FAIL'} ${e.detail}`),
    });
  });
  afterAll(async () => {
    await workers?.close();
    await queues.close();
    await app?.close();
    connection.disconnect();
    await db?.$disconnect();
  });

  it('uploads a document set and serves the same problems as the answer key', async () => {
    const setId = 'S0010';
    const truth = JSON.parse(
      fs.readFileSync(path.join(golden, setId, 'ground_truth.json'), 'utf8'),
    );
    for (const d of truth.documents) {
      const res = await app.inject({
        method: 'POST',
        url: '/documents',
        ...multipart(new Uint8Array(fs.readFileSync(path.join(golden, setId, d.file))), d.file),
      });
      expect(res.statusCode).toBe(202);
    }
    // Wait for the worker: read every document, then match the PO (debounced).
    let set: {
      status?: string;
      match?: { exceptions: { type: string; amount: string; informational: boolean }[] };
    } = {};
    for (let i = 0; i < 120 && !(set.match && set.status !== 'WAITING'); i++) {
      await new Promise((r) => setTimeout(r, 500));
      const res = await app.inject({ method: 'GET', url: `/sets/${truth.poNumber}` });
      if (res.statusCode === 200) set = res.json();
    }
    expect(set.status, events.join('\n')).toBe('MATCHED');
    const got = set.match!.exceptions.map((e) => `${e.type}:${e.amount}:${e.informational}`).sort();
    const want = truth.exceptions
      .map(
        (e: { type: string; amount: string; informational: boolean }) =>
          `${e.type}:${e.amount}:${e.informational}`,
      )
      .sort();
    expect(got).toEqual(want);
    expect(events.filter((e) => e.startsWith('read ok'))).toHaveLength(truth.documents.length);
    const health = (await app.inject({ method: 'GET', url: '/health' })).json();
    expect(health).toEqual({ ok: true, database: true, queue: true });
  }, 90_000);
});
