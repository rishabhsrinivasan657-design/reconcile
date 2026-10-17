import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrismaClient } from '@reconcile/db';
import { seed } from '@reconcile/db/seed';
import { FileCacheStore, LlmClient, LlmEnv } from '@reconcile/llm';
import {
  LocalStorage,
  matchPurchaseOrder,
  memoryEventBus,
  prismaSink,
  readDocument,
  uploadDocument,
} from '@reconcile/pipeline';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const golden = path.join(root, 'evals/golden-ci');
const testDbUrl = process.env.DATABASE_URL_TEST;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-work-'));
// S0023: a price variance and an extra invoice line (UNMATCHED_LINE).
const SET = 'S0023';

describe.skipIf(!testDbUrl)('API for the website (M5 AC-1, AC-2, AC-4–AC-7)', () => {
  const db = testDbUrl ? createPrismaClient(testDbUrl) : undefined!;
  const storage = new LocalStorage(tmp());
  const events = memoryEventBus();
  const rematch: string[] = [];
  let app: Awaited<ReturnType<typeof buildApp>>;
  const truth = JSON.parse(fs.readFileSync(path.join(golden, SET, 'ground_truth.json'), 'utf8'));
  const po: string = truth.poNumber;

  const processSet = async () => {
    const llm = new LlmClient({
      env: LlmEnv.parse({ LLM_CACHE_DIR: tmp() }),
      cache: new FileCacheStore(path.join(root, 'evals/cache')),
      mode: 'replay',
      sink: prismaSink(db),
    });
    for (const d of truth.documents) {
      const bytes = new Uint8Array(fs.readFileSync(path.join(golden, SET, d.file)));
      const { document } = await uploadDocument(db, storage, bytes);
      await readDocument(db, { storage, llm }, document.id);
    }
    await matchPurchaseOrder(db, po, { graceDays: 0 });
  };
  const get = async (url: string) => (await app.inject({ method: 'GET', url })).json();
  const post = (url: string, payload: object) => app.inject({ method: 'POST', url, payload });

  beforeAll(async () => {
    app = await buildApp({
      db,
      storage,
      events,
      queues: {
        enqueueRead: async () => undefined,
        enqueueMatch: async (p: string) => void rematch.push(p),
      } as never,
    });
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });
  beforeEach(async () => {
    rematch.length = 0;
    events.published.length = 0;
    await db.$executeRawUnsafe(
      'TRUNCATE "AuditEvent","LlmCall","ExceptionActionRecord","Exception","LineMatch","MatchRun","Extraction","Document","DocumentSet","CatalogItem","Vendor","User" RESTART IDENTITY CASCADE',
    );
    await seed(db);
    await processSet();
  });

  it('AC-1: a decision needs a note, is saved with history, and can only be made once', async () => {
    const [top] = await get(`/exceptions?sort=impact&status=OPEN`);
    expect(top.vendorName).toBeTruthy();

    const noNote = await post(`/exceptions/${top.id}/decision`, {
      action: 'WRITE_OFF',
      note: '  ',
    });
    expect(noNote.statusCode).toBe(400);
    expect(noNote.json().detail).toMatch(/note/);

    const ok = await post(`/exceptions/${top.id}/decision`, {
      action: 'WRITE_OFF',
      note: 'Below our dispute threshold.',
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({
      status: 'WRITTEN_OFF',
      decision: {
        action: 'WRITE_OFF',
        note: 'Below our dispute threshold.',
        by: 'Alex Rivera (AP)',
      },
    });
    expect(events.published).toContainEqual({
      kind: 'exception',
      id: top.id,
      poNumber: po,
      status: 'WRITTEN_OFF',
    });

    const again = await post(`/exceptions/${top.id}/decision`, { action: 'APPROVE', note: 'x' });
    expect(again.statusCode).toBe(409);
    expect(again.json().detail).toMatch(/Already decided by Alex Rivera/);

    const audit = await db.auditEvent.findFirst({ where: { action: 'exception.decided' } });
    expect(audit).toMatchObject({ actorType: 'USER', entityId: top.id });
    expect((await get(`/exceptions?status=OPEN`)).map((e: { id: string }) => e.id)).not.toContain(
      top.id,
    );
  });

  it('AC-5: problems sort by impact, and a problem shows its lines side by side', async () => {
    const list = await get(`/exceptions?sort=impact`);
    const amounts = list
      .filter((e: { informational: boolean }) => !e.informational)
      .map((e: { amount: string }) => Number(e.amount));
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a));

    const price = list.find((e: { type: string }) => e.type === 'PRICE_VARIANCE');
    const detail = await get(`/exceptions/${price.id}`);
    const row = detail.comparison[0];
    expect(row.po.unitPrice).toBeTruthy();
    expect(row.invoice.unitPrice).toBeTruthy();
    expect(row.po.unitPrice).not.toBe(row.invoice.unitPrice);
    expect(detail.documents.length).toBeGreaterThanOrEqual(2);

    const extra = list.find((e: { type: string }) => e.type === 'UNMATCHED_LINE');
    const extraDetail = await get(`/exceptions/${extra.id}`);
    expect(
      extraDetail.comparison.some((r: { invoice: unknown; po: unknown }) => r.invoice && !r.po),
    ).toBe(true);
  });

  it('AC-6: the PO history reads as plain sentences, including the decision and its note', async () => {
    const [top] = await get(`/exceptions?sort=impact`);
    await post(`/exceptions/${top.id}/decision`, {
      action: 'DISPUTE',
      note: 'Asked for a credit.',
    });
    const history = await get(`/sets/${po}/history`);
    const summaries = history.map((h: { summary: string }) => h.summary);
    expect(summaries.some((s: string) => /^Uploaded /.test(s))).toBe(true);
    expect(summaries.some((s: string) => /^Matched \(version 1\)/.test(s))).toBe(true);
    expect(summaries.some((s: string) => /^Problem raised: price over PO/.test(s))).toBe(true);
    const decided = history.find((h: { action: string }) => h.action === 'exception.decided');
    expect(decided).toMatchObject({
      actor: { type: 'USER', name: 'Alex Rivera (AP)' },
      note: 'Asked for a credit.',
      poNumber: po,
    });
    expect(summaries.at(-1)).toMatch(/^Disputed /);
    expect((await app.inject({ method: 'GET', url: '/sets/NOPE/history' })).statusCode).toBe(404);
  });

  it('AC-7: overview numbers match the database', async () => {
    const ov = await get('/overview');
    const open = await db.exception.findMany({ where: { status: 'OPEN', informational: false } });
    const cents = open.reduce((s, e) => s + Math.round(Number(e.amount) * 100), 0);
    expect(ov.moneyAtRisk).toBe((cents / 100).toFixed(2));
    expect(ov.openProblems).toBe(open.length);
    expect(ov.byType.map((t: { type: string }) => t.type).sort()).toEqual(
      [...new Set(open.map((e) => e.type))].sort(),
    );
    expect(ov.sets).toMatchObject({ total: 1 });
    expect(ov.documents.total).toBe(truth.documents.length);
    expect(ov.ai.documentsRead).toBe(truth.documents.length);
    expect(ov.ai.cachedShare).toBe(1);
    expect(ov.recent.length).toBeGreaterThan(3);
  });

  it('AC-2: a correction saves a human version, keeps the AI one, and queues a re-match', async () => {
    const set = await get(`/sets/${po}`);
    const inv = set.documents.find((d: { type: string }) => d.type === 'INVOICE');
    const bad = await post(`/documents/${inv.id}/corrections`, { fields: { total: 'lots' } });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().detail).toMatch(/total: must be an amount/);

    const res = await post(`/documents/${inv.id}/corrections`, { fields: { total: '1.00' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 2, rematching: [po] });
    expect(res.json().warnings.join(' ')).toMatch(/but the total is 1.00/);
    expect(rematch).toEqual([po]);

    const versions = await db.extraction.findMany({
      where: { documentId: inv.id },
      orderBy: { version: 'asc' },
    });
    expect(versions.map((v) => v.source)).toEqual(['LLM', 'HUMAN']);
    expect((versions[1]!.data as { total: string }).total).toBe('1.00');
    const detail = await get(`/documents/${inv.id}`);
    expect(detail.extraction.version).toBe(2);
    expect(detail.extraction.confidence.total).toBe(1);

    // After the re-match, a decision on the old match's problem is refused.
    const [old] = await get(`/exceptions?sort=impact`);
    await matchPurchaseOrder(db, po, { graceDays: 0 });
    const stale = await post(`/exceptions/${old.id}/decision`, { action: 'APPROVE', note: 'ok' });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().detail).toMatch(/re-matched/);
  });

  it('AC-4: serves each page as an image', async () => {
    const set = await get(`/sets/${po}`);
    const pdf = set.documents.find((d: { mimeType: string }) => d.mimeType === 'application/pdf');
    const page = await app.inject({ method: 'GET', url: `/documents/${pdf.id}/pages/1` });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-type']).toBe('image/png');
    expect([...page.rawPayload.subarray(1, 4)].map((c) => String.fromCharCode(c)).join('')).toBe(
      'PNG',
    );
    // Second request comes from storage, same bytes.
    const again = await app.inject({ method: 'GET', url: `/documents/${pdf.id}/pages/1` });
    expect(again.rawPayload.equals(page.rawPayload)).toBe(true);
    expect(
      (await app.inject({ method: 'GET', url: `/documents/${pdf.id}/pages/9` })).statusCode,
    ).toBe(404);
  });

  it('AC-3: the live feed streams announcements to a connected browser', async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as { port: number };
    const ctrl = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events`, { signal: ctrl.signal });
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    const reader = res.body!.getReader();
    let text = new TextDecoder().decode((await reader.read()).value);
    expect(text).toContain('retry:');
    await events.publish({ kind: 'set', poNumber: po, status: 'MATCHED' });
    text = new TextDecoder().decode((await reader.read()).value);
    expect(text).toBe(
      `event: change\ndata: ${JSON.stringify({ kind: 'set', poNumber: po, status: 'MATCHED' })}\n\n`,
    );
    ctrl.abort();
  });
});
