import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPrismaClient } from '@reconcile/db';
import { seed } from '@reconcile/db/seed';
import { FileCacheStore, LlmClient, LlmEnv } from '@reconcile/llm';
import { LocalStorage, matchPurchaseOrder, prismaSink, readDocument } from '@reconcile/pipeline';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';

const root = path.resolve(import.meta.dirname, '../../..');
const golden = path.join(root, 'evals/golden-ci');
const testDbUrl = process.env.DATABASE_URL_TEST;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-api-'));

function multipart(bytes: Uint8Array, filename: string) {
  const boundary = '----reconcile' + Math.random().toString(16).slice(2);
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([head, Buffer.from(bytes), tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}
const goldenFile = (setId: string, role: string) => {
  const f = fs.readdirSync(path.join(golden, setId)).find((x) => x.startsWith(`${role}.`))!;
  return { bytes: new Uint8Array(fs.readFileSync(path.join(golden, setId, f))), name: f };
};

describe.skipIf(!testDbUrl)('API (M4 AC-1, AC-2, AC-3)', () => {
  const db = testDbUrl ? createPrismaClient(testDbUrl) : undefined!;
  const storage = new LocalStorage(tmp());
  const enqueued: string[] = [];
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({
      db,
      storage,
      queues: { enqueueRead: async (id: string) => void enqueued.push(id) } as never,
    });
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
  });
  beforeEach(async () => {
    enqueued.length = 0;
    await db.$executeRawUnsafe(
      'TRUNCATE "AuditEvent","LlmCall","ExceptionActionRecord","Exception","LineMatch","MatchRun","Extraction","Document","DocumentSet","CatalogItem","Vendor","User" RESTART IDENTITY CASCADE',
    );
    await seed(db);
  });

  it('upload: 202 and queued; same file again: 200, not queued', async () => {
    const f = goldenFile('S0010', 'po');
    const first = await app.inject({
      method: 'POST',
      url: '/documents',
      ...multipart(f.bytes, f.name),
    });
    expect(first.statusCode).toBe(202);
    expect(first.json()).toMatchObject({
      duplicate: false,
      document: { status: 'UPLOADED', mimeType: 'application/pdf' },
    });
    const again = await app.inject({
      method: 'POST',
      url: '/documents',
      ...multipart(f.bytes, f.name),
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().duplicate).toBe(true);
    expect(enqueued).toEqual([first.json().document.id]);
  });

  it('rejects non-documents and missing files with problem JSON', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/documents',
      ...multipart(new TextEncoder().encode('MZ not a pdf'), 'evil.pdf'),
    });
    expect(bad.statusCode).toBe(415);
    expect(bad.headers['content-type']).toContain('application/problem+json');
    expect(bad.json()).toMatchObject({ status: 415, title: 'Upload rejected' });
    const missing = await app.inject({ method: 'GET', url: '/documents/nope' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().title).toBe('Not found');
    const invalid = await app.inject({ method: 'GET', url: '/documents?limit=0' });
    expect(invalid.statusCode).toBe(400);
  });

  it('serves the live manual listing every address', async () => {
    const res = await app.inject({ method: 'GET', url: '/docs/json' });
    const paths = Object.keys(res.json().paths);
    for (const p of [
      '/health',
      '/documents',
      '/documents/{id}',
      '/documents/{id}/file',
      '/sets',
      '/sets/{poNumber}',
      '/exceptions',
      '/exceptions/{id}',
    ]) {
      expect(paths, p).toContain(p);
    }
  });

  it('after processing, a PO and its problems are served with explanations', async () => {
    const llm = new LlmClient({
      env: LlmEnv.parse({ LLM_CACHE_DIR: tmp() }),
      cache: new FileCacheStore(path.join(root, 'evals/cache')),
      mode: 'replay',
      sink: prismaSink(db),
    });
    const truth = JSON.parse(fs.readFileSync(path.join(golden, 'S0010/ground_truth.json'), 'utf8'));
    for (const d of truth.documents) {
      const f = goldenFile('S0010', d.role);
      const res = await app.inject({
        method: 'POST',
        url: '/documents',
        ...multipart(f.bytes, f.name),
      });
      await readDocument(db, { storage, llm }, res.json().document.id);
    }
    await matchPurchaseOrder(db, truth.poNumber, { graceDays: 7 });

    const set = (await app.inject({ method: 'GET', url: `/sets/${truth.poNumber}` })).json();
    expect(set.status).toBe('MATCHED');
    expect(set.documents).toHaveLength(truth.documents.length);
    expect(set.match.exceptions.map((e: { type: string }) => e.type).sort()).toEqual(
      truth.exceptions.map((e: { type: string }) => e.type).sort(),
    );
    expect(set.match.exceptions[0].explanation).toMatch(/\$/);

    const list = (
      await app.inject({ method: 'GET', url: `/exceptions?type=${truth.exceptions[0].type}` })
    ).json();
    expect(list.length).toBeGreaterThan(0);
    const one = await app.inject({ method: 'GET', url: `/exceptions/${list[0].id}` });
    expect(one.json().poNumber).toBe(truth.poNumber);

    const doc = (
      await app.inject({ method: 'GET', url: `/documents/${set.documents[0].id}` })
    ).json();
    expect(doc.extraction.version).toBe(1);
    expect(Object.keys(doc.extraction.confidence).length).toBeGreaterThan(5);
    expect(doc.llm.calls).toBeGreaterThan(0);

    const file = await app.inject({ method: 'GET', url: `/documents/${set.documents[0].id}/file` });
    expect(file.statusCode).toBe(200);
    expect(file.rawPayload.length).toBeGreaterThan(1000);
  });
});
