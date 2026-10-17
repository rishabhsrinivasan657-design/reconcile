import { seed } from '@reconcile/db/seed';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { matchPurchaseOrder } from '../src/match.ts';
import { readDocument } from '../src/read.ts';
import { RedisLimiter } from '../src/redis-limiter.ts';
import { sniffType, uploadDocument, UploadRejected } from '../src/upload.ts';
import { db, goldenFile, hasInfra, redis, replayLlm, reset, storage, truthOf } from './helpers.ts';

describe.skipIf(!hasInfra)('pipeline (M4)', () => {
  const client = hasInfra ? db() : undefined!;
  afterAll(() => client?.$disconnect());
  beforeEach(async () => {
    await reset(client);
    await seed(client);
  });

  it('upload: saves once per file and rejects non-documents (AC-1)', async () => {
    const st = storage();
    const pdf = goldenFile('S0010', 'po');
    const a = await uploadDocument(client, st, pdf);
    const b = await uploadDocument(client, st, pdf);
    expect([a.duplicate, b.duplicate]).toEqual([false, true]);
    expect(b.document.id).toBe(a.document.id);
    expect(sniffType(pdf)?.mime).toBe('application/pdf');
    await expect(
      uploadDocument(client, st, new TextEncoder().encode('MZ fake exe')),
    ).rejects.toThrow(UploadRejected);
    await expect(
      uploadDocument(client, st, new Uint8Array(11 * 1024 * 1024).fill(0x25)),
    ).rejects.toThrow(/10 MB/);
    expect(await client.auditEvent.count({ where: { action: 'document.uploaded' } })).toBe(1);
  });

  /** Upload + read every document of a golden set (recorded AI answers). */
  async function ingest(setId: string) {
    const st = storage();
    const llm = replayLlm();
    const truth = truthOf(setId);
    const out = [];
    for (const d of truth.documents) {
      const { document } = await uploadDocument(client, st, goldenFile(setId, d.role));
      out.push(await readDocument(client, { storage: st, llm }, document.id));
    }
    return { truth, read: out };
  }

  it('read + match a complete set: exceptions equal the answer key (AC-4, AC-5)', async () => {
    const { truth, read } = await ingest('S0010');
    expect(read.every((r) => r.poNumber === truth.poNumber)).toBe(true);
    const [outcome] = await matchPurchaseOrder(client, truth.poNumber, { graceDays: 7 });
    expect(outcome!.status).toBe('MATCHED');
    const run = await client.matchRun.findFirstOrThrow({ include: { exceptions: true } });
    const got = run.exceptions
      .map((e) => `${e.type}:${e.amount.toFixed(2)}:${e.informational}`)
      .sort();
    const want = truth.exceptions
      .map(
        (e: { type: string; amount: string; informational: boolean }) =>
          `${e.type}:${e.amount}:${e.informational}`,
      )
      .sort();
    expect(got).toEqual(want);
    expect(await client.extraction.count()).toBe(truth.documents.length);
    expect(await client.auditEvent.count({ where: { action: 'set.matched' } })).toBe(1);
  });

  it('grace period: a missing document waits, then is reported (AC-6)', async () => {
    const setId = 'S0001'; // planted: missing document
    const { truth } = await ingest(setId);
    const [waiting] = await matchPurchaseOrder(client, truth.poNumber, { graceDays: 7 });
    expect(waiting!.status).toBe('WAITING');
    expect(waiting!.waitingUntil).toBeInstanceOf(Date);
    expect(await client.exception.count({ where: { type: 'MISSING_DOCUMENT' } })).toBe(0);
    const later = new Date(Date.now() + 8 * 86_400_000);
    const [reported] = await matchPurchaseOrder(client, truth.poNumber, {
      graceDays: 7,
      now: later,
    });
    expect(reported!.status).not.toBe('WAITING');
    expect(await client.exception.count({ where: { type: 'MISSING_DOCUMENT' } })).toBe(1);
  });

  it('a set with a document flagged for review is matched but provisional (AC-16)', async () => {
    const { truth } = await ingest('S0010');
    const doc = await client.document.findFirstOrThrow({ where: { type: 'INVOICE' } });
    await client.extraction.updateMany({
      where: { documentId: doc.id },
      data: { needsReview: true },
    });
    const [outcome] = await matchPurchaseOrder(client, truth.poNumber, { graceDays: 7 });
    expect(outcome).toMatchObject({ status: 'NEEDS_REVIEW', provisional: true });
    const set = await client.documentSet.findUniqueOrThrow({ where: { poNumber: truth.poNumber } });
    expect(set.provisional).toBe(true);
    expect(await client.exception.count()).toBe(truth.exceptions.length);
  });

  it('a human decision carries over to the next match run (AC-5)', async () => {
    const { truth } = await ingest('S0010');
    await matchPurchaseOrder(client, truth.poNumber, { graceDays: 7 });
    const first = await client.exception.findFirstOrThrow();
    await client.exception.update({ where: { id: first.id }, data: { status: 'DISPUTED' } });
    await matchPurchaseOrder(client, truth.poNumber, { graceDays: 7 });
    const runs = await client.matchRun.findMany({
      orderBy: { version: 'asc' },
      include: { exceptions: true },
    });
    expect(runs.map((r) => r.version)).toEqual([1, 2]);
    const carried = runs[1]!.exceptions.find((e) => e.fingerprint === first.fingerprint)!;
    expect(carried.status).toBe('DISPUTED');
    expect(carried.carriedOverFromId).toBe(first.id);
  });
});

describe.skipIf(!hasInfra)('shared rate limit in Redis (AC-7)', () => {
  it('two limiters sharing Redis together allow only the configured rate', async () => {
    const r = redis();
    const prefix = `test:${Date.now()}`;
    let t = Date.parse('2026-10-17T12:00:00Z');
    const slept: number[] = [];
    const make = () =>
      new RedisLimiter(
        r,
        { rpm: 4, rpd: 100 },
        prefix,
        () => t,
        async (ms) => {
          slept.push(ms);
          t += ms;
        },
      );
    const [a, b] = [make(), make()];
    for (let i = 0; i < 2; i++) {
      await a.acquire();
      await b.acquire();
    }
    expect(slept).toEqual([]);
    await a.acquire(); // 5th request in the same minute across both: must wait 15 s at 4/min
    expect(slept[0]).toBe(15_000);
    await r.quit();
  });
});
