import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { buildApp } from '@reconcile/api/src/app.ts';
import { createPrismaClient } from '@reconcile/db';
import { seed } from '@reconcile/db/seed';
import { FileCacheStore, LlmClient, LlmEnv } from '@reconcile/llm';
import {
  LocalStorage,
  matchPurchaseOrder,
  readDocument,
  uploadDocument,
} from '@reconcile/pipeline';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * M6 AC-2, AC-3, AC-11: the real API on the test database, real test sets read with the recorded AI
 * answers, and the MCP server started as its own program over standard input/output, exactly the
 * way Claude Code runs it. No AI key needed.
 */
const root = path.resolve(import.meta.dirname, '../../..');
const golden = path.join(root, 'evals/golden-ci');
const testDbUrl = process.env.DATABASE_URL_TEST;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-mcp-'));
const truthOf = (id: string) =>
  JSON.parse(fs.readFileSync(path.join(golden, id, 'ground_truth.json'), 'utf8'));
// Every short-ship in the CI subset (S0010, S0038, S0083, S0134), plus S0023 (price + extra line).
const SETS = ['S0010', 'S0038', 'S0083', 'S0134', 'S0023'];

describe.skipIf(!testDbUrl)('MCP server end to end (M6)', () => {
  const db = testDbUrl ? createPrismaClient(testDbUrl) : undefined!;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let apiUrl: string;
  let client: Client;
  const api = async (p: string) => (await fetch(apiUrl + p)).json();
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const r = await client.callTool({ name, arguments: args });
    expect(r.isError, `${name}: ${JSON.stringify(r.content)}`).toBeFalsy();
    return r as { structuredContent: Record<string, unknown>; content: { text: string }[] };
  };

  beforeAll(async () => {
    await db.$executeRawUnsafe(
      'TRUNCATE "AuditEvent","LlmCall","ExceptionActionRecord","Exception","LineMatch","MatchRun","Extraction","Document","DocumentSet","CatalogItem","Vendor","User" RESTART IDENTITY CASCADE',
    );
    await seed(db);
    const storage = new LocalStorage(tmp());
    const llm = new LlmClient({
      env: LlmEnv.parse({ LLM_CACHE_DIR: tmp() }),
      cache: new FileCacheStore(path.join(root, 'evals/cache')),
      mode: 'replay',
    });
    for (const id of SETS) {
      const t = truthOf(id);
      for (const d of t.documents) {
        const { document } = await uploadDocument(
          db,
          storage,
          new Uint8Array(fs.readFileSync(path.join(golden, id, d.file))),
        );
        await readDocument(db, { storage, llm }, document.id);
      }
      await matchPurchaseOrder(db, t.poNumber, { graceDays: 0 });
    }
    app = await buildApp({
      db,
      storage,
      queues: { enqueueRead: async () => undefined, enqueueMatch: async () => undefined } as never,
    });
    await app.listen({ port: 0, host: '127.0.0.1' });
    apiUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;

    // Start the connector as its own program, like `claude mcp add reconcile -- pnpm mcp` does.
    client = new Client({ name: 'e2e', version: '1' });
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: ['--import', 'tsx', path.join(root, 'packages/mcp/src/main.ts')],
        env: {
          ...(process.env as Record<string, string>),
          RECONCILE_API_URL: apiUrl,
          RECONCILE_WEB_URL: 'http://web.test',
        },
        cwd: root,
        stderr: 'pipe',
      }),
    );
  });
  afterAll(async () => {
    await client?.close();
    await app?.close();
    await db?.$disconnect();
  });

  it('AC-11: the connector starts as its own program and lists its six tools', async () => {
    expect((await client.listTools()).tools).toHaveLength(6);
    expect(client.getServerVersion()?.name).toBe('reconcile');
  });

  it('AC-3: short-shipments by receiving date match the answer keys', async () => {
    const expected = ['S0010', 'S0038', 'S0083', 'S0134']
      .map((id) => {
        const t = truthOf(id);
        const e = t.exceptions.find((x: { type: string }) => x.type === 'SHORT_SHIP');
        const rr = t.documents.find((d: { role: string }) => d.role === 'rr');
        return {
          poNumber: t.poNumber,
          receivedOn: rr.fields.date.value,
          amountAtRisk: e.amount,
          billedCorrectly: e.informational,
        };
      })
      .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn));
    const year = await call('find_short_shipments', { from: '2026-01-01', to: '2026-12-31' });
    const got = (year.structuredContent.shortShipments as Record<string, unknown>[]).map((s) => ({
      poNumber: s.poNumber,
      receivedOn: s.receivedOn,
      amountAtRisk: s.amountAtRisk,
      billedCorrectly: s.billedCorrectly,
    }));
    expect(got).toEqual(expected);
    for (const s of year.structuredContent.shortShipments as {
      ordered: number;
      received: number;
    }[])
      expect(s.received).toBeLessThan(s.ordered);

    const one = expected[1]!;
    const day = await call('find_short_shipments', { from: one.receivedOn, to: one.receivedOn });
    expect(
      (day.structuredContent.shortShipments as { poNumber: string }[]).map((s) => s.poNumber),
    ).toEqual([one.poNumber]);
    const none = await call('find_short_shipments', { from: '2025-01-01', to: '2025-12-31' });
    expect(none.content[0]!.text).toBe(
      'Nothing was short-shipped between 2025-01-01 and 2025-12-31.',
    );
  });

  it('AC-2: every tool gives the same answers as the API (the website’s source)', async () => {
    // list_exceptions = open, money-at-risk problems from GET /exceptions
    const fromApi = (await api('/exceptions?sort=impact&status=OPEN')).filter(
      (e: { informational: boolean }) => !e.informational,
    );
    const listed = await call('list_exceptions', { limit: 50 });
    expect(
      (listed.structuredContent.problems as { id: string; amount: string }[]).map((p) => [
        p.id,
        p.amount,
      ]),
    ).toEqual(fromApi.map((e: { id: string; amount: string }) => [e.id, e.amount]));

    // explain_match = GET /sets/:po
    const po = truthOf('S0023').poNumber;
    const set = await api(`/sets/${po}`);
    const explained = await call('explain_match', { poNumber: po });
    expect(
      (explained.structuredContent.problems as { id: string }[]).map((p) => p.id).sort(),
    ).toEqual(set.match.exceptions.map((e: { id: string }) => e.id).sort());
    expect((explained.structuredContent.lines as unknown[]).length).toBe(
      set.match.lineMatches.length,
    );
    expect(explained.content[0]!.text).toMatch(/line not on PO/);

    // get_audit_trail = GET /sets/:po/history (minus "started reading")
    const history = (await api(`/sets/${po}/history`)).filter(
      (h: { action: string }) => h.action !== 'document.reading',
    );
    const trail = await call('get_audit_trail', { poNumber: po });
    expect((trail.structuredContent.entries as { what: string }[]).map((e) => e.what)).toEqual(
      history.map((h: { summary: string }) => h.summary),
    );

    // get_overview = GET /overview
    const overview = await api('/overview');
    const o = await call('get_overview');
    expect(o.structuredContent).toMatchObject({
      moneyAtRisk: overview.moneyAtRisk,
      openProblems: overview.openProblems,
    });

    // find_purchase_orders = GET /sets
    const sets = await api('/sets');
    const found = await call('find_purchase_orders', { limit: 50 });
    expect(
      (found.structuredContent.purchaseOrders as { poNumber: string }[])
        .map((p) => p.poNumber)
        .sort(),
    ).toEqual(sets.map((s: { poNumber: string }) => s.poNumber).sort());
  });
});
