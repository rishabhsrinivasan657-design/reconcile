import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildApp } from '@reconcile/api/src/app.ts';
import { GroundTruth, matchDocuments } from '@reconcile/core';
import { createPrismaClient } from '@reconcile/db';
import { seed } from '@reconcile/db/seed';
import { extractDocument, fuzzyFor, mimeFor } from '@reconcile/extraction';
import { FileCacheStore, LlmClient, LlmEnv } from '@reconcile/llm';
import { createQueues, LocalStorage, prismaSink } from '@reconcile/pipeline';
import { Redis } from 'ioredis';
import { afterAll, describe, expect, it } from 'vitest';
import { startWorkers } from '../src/workers.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const golden = path.join(root, 'evals/golden-ci');
const testDbUrl = process.env.DATABASE_URL_TEST;
const redisUrl = process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/1';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-eq-'));
const replay = (sink?: ReturnType<typeof prismaSink>) =>
  new LlmClient({
    env: LlmEnv.parse({ LLM_CACHE_DIR: tmp() }),
    cache: new FileCacheStore(path.join(root, 'evals/cache')),
    mode: 'replay',
    ...(sink ? { sink } : {}),
  });

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

const sets = fs
  .readdirSync(golden)
  .filter((d) => /^S\d{4}$/.test(d))
  .sort()
  .map((id) =>
    GroundTruth.parse(
      JSON.parse(fs.readFileSync(path.join(golden, id, 'ground_truth.json'), 'utf8')),
    ),
  );
const key = (e: { poNumber: string; type: string; amount: string; informational: boolean }) =>
  `${e.poNumber}|${e.type}|${e.amount}|${e.informational}`;

describe.skipIf(!testDbUrl)(
  'the real pipeline gives the same answers as the e2e eval (M4 AC-12)',
  () => {
    const db = testDbUrl ? createPrismaClient(testDbUrl) : undefined!;
    const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    const queues = createQueues(connection);
    let close: () => Promise<void> = async () => {};
    afterAll(async () => {
      await close();
      await queues.close();
      connection.disconnect();
      await db?.$disconnect();
    });

    it('20 CI sets through API + queue + worker = e2e eval, problem for problem', async () => {
      // 1) What the e2e eval predicts: AI reading (replayed) → matcher with hybrid pairing.
      const evalLlm = replay();
      const docs = [];
      const poOf = new Map<string, string>();
      for (const t of sets) {
        for (const d of t.documents) {
          const id = `${t.setId}/${d.role}`;
          poOf.set(id, t.poNumber);
          const r = await extractDocument(
            new Uint8Array(fs.readFileSync(path.join(golden, t.setId, d.file))),
            { llm: evalLlm, id, mime: mimeFor(d.file) },
          );
          if (r.document) docs.push(r.document);
        }
      }
      const predicted = await matchDocuments(docs, { fuzzy: fuzzyFor('hybrid', evalLlm)! });
      const evalKeys = predicted.groups
        .flatMap((g) =>
          g.exceptions.map((e) => ({
            poNumber: poOf.get(e.lines[0]?.docId ?? e.documentIds[0]!)!,
            type: e.type,
            amount: e.amount,
            informational: e.informational,
          })),
        )
        .map(key)
        .sort();

      // 2) The real system: upload every file, let the worker read and match (grace period 0).
      await connection.flushdb();
      await db.$executeRawUnsafe(
        'TRUNCATE "AuditEvent","LlmCall","ExceptionActionRecord","Exception","LineMatch","MatchRun","Extraction","Document","DocumentSet","CatalogItem","Vendor","User" RESTART IDENTITY CASCADE',
      );
      await seed(db);
      const storage = new LocalStorage(tmp());
      const llm = replay(prismaSink(db));
      const app = await buildApp({ db, storage, queues });
      const workers = startWorkers({
        db,
        storage,
        llm,
        queues,
        connection,
        graceDays: 0,
        fuzzy: fuzzyFor('hybrid', llm)!,
      });
      close = async () => {
        await workers.close();
        await app.close();
      };
      for (const t of sets) {
        for (const d of t.documents) {
          const res = await app.inject({
            method: 'POST',
            url: '/documents',
            ...multipart(
              new Uint8Array(fs.readFileSync(path.join(golden, t.setId, d.file))),
              d.file,
            ),
          });
          expect(res.statusCode, `${t.setId}/${d.role}`).toBe(202);
        }
      }
      // Wait until every document is read and every queue is idle.
      for (let i = 0; i < 240; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const pending = await db.document.count({
          where: { status: { in: ['UPLOADED', 'EXTRACTING'] } },
        });
        const counts = await queues.match.getJobCounts('waiting', 'active', 'delayed');
        if (
          pending === 0 &&
          (counts.waiting ?? 0) + (counts.active ?? 0) + (counts.delayed ?? 0) === 0 &&
          i > 6
        )
          break;
      }
      const served = (await app.inject({ method: 'GET', url: '/exceptions' })).json() as {
        poNumber: string;
        type: string;
        amount: string;
        informational: boolean;
      }[];
      expect(served.map(key).sort()).toEqual(evalKeys);
    }, 180_000);
  },
);
