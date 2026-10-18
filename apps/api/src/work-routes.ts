import type { PrismaClient } from '@reconcile/db';
import {
  ActionRefused,
  correctDocument,
  decideException,
  pageImage,
  type EventBus,
  type Queues,
  type Storage,
} from '@reconcile/pipeline';
import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { describe, historyContext } from './history.ts';
import {
  Correction,
  CorrectionResult,
  Decision,
  ExceptionView,
  HistoryEntry,
  Me,
  Overview,
  Problem,
  ReviewItem,
  ShortShipment,
} from './schemas.ts';
import { exceptionInclude, exceptionView, linesOf, NotFound, setsWithLatestRun } from './views.ts';
import { ExtractedDocument } from '@reconcile/core';

type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export interface WorkDeps {
  db: PrismaClient;
  storage: Storage;
  queues: Pick<Queues, 'enqueueMatch'>;
  events: EventBus;
}

const errors = { 400: Problem, 404: Problem, 409: Problem, 500: Problem };
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** M5: what the website needs beyond reading (decide, correct, history, overview, live feed). */
export function registerWorkRoutes(app: App, deps: WorkDeps) {
  const { db } = deps;
  /** The one built-in user (no logins yet, see PRD non-goals). */
  const currentUser = async () => {
    const u = await db.user.findFirst({ orderBy: { createdAt: 'asc' } });
    if (!u) throw new NotFound('No user: run pnpm db:seed');
    return u;
  };

  app.get(
    '/me',
    {
      schema: {
        summary: 'The signed-in user (the one built-in user)',
        response: { 200: Me, ...errors },
      },
    },
    async () => {
      const u = await currentUser();
      return { id: u.id, name: u.name, email: u.email };
    },
  );

  app.get(
    '/short-shipments',
    {
      schema: {
        summary:
          'Lines where less arrived than was ordered (SHORT_SHIP), by the receiving report date',
        querystring: z
          .object({
            from: z.iso.date().optional().describe('First receiving date to include (YYYY-MM-DD)'),
            to: z.iso.date().optional().describe('Last receiving date to include (YYYY-MM-DD)'),
            vendor: z.string().optional().describe('Part of the vendor name'),
          })
          .refine((q) => !q.from || !q.to || q.from <= q.to, '"from" must be on or before "to"'),
        response: { 200: z.array(ShortShipment), ...errors },
      },
    },
    async (req) => {
      const { from, to, vendor } = req.query;
      const sets = await setsWithLatestRun(db);
      const out: z.infer<typeof ShortShipment>[] = [];
      for (const s of sets) {
        const run = s.matchRuns[0];
        const shorts = run?.exceptions.filter((e) => e.type === 'SHORT_SHIP') ?? [];
        if (!run || shorts.length === 0) continue;
        if (vendor && !s.vendor?.name.toLowerCase().includes(vendor.toLowerCase())) continue;
        const lines = await linesOf(db, s.documents);
        const rr = s.documents.find((d) => d.type === 'RR');
        const rrEx = rr
          ? await db.extraction.findFirst({
              where: { documentId: rr.id },
              orderBy: { version: 'desc' },
            })
          : null;
        const parsed = rrEx ? ExtractedDocument.safeParse(rrEx.data) : undefined;
        const receivedOn = parsed?.success ? parsed.data.date : null;
        if ((from || to) && !receivedOn) continue;
        if (from && receivedOn! < from) continue;
        if (to && receivedOn! > to) continue;
        for (const e of shorts) {
          const keys = new Set(e.lineKeys as string[]);
          const m = run.lineMatch.find((lm) =>
            [lm.poLineKey, lm.rrLineKey, lm.invLineKey].some((k) => k && keys.has(k)),
          );
          const po = m?.poLineKey ? lines.get(m.poLineKey) : undefined;
          const got = m?.rrLineKey ? lines.get(m.rrLineKey) : undefined;
          const inv = m?.invLineKey ? lines.get(m.invLineKey) : undefined;
          if (!po || !got) continue;
          out.push({
            exceptionId: e.id,
            poNumber: s.poNumber,
            vendorName: s.vendor?.name ?? null,
            receivedOn,
            sku: po.sku,
            description: po.description,
            uom: po.uom,
            ordered: po.qty,
            received: got.qty,
            billed: inv?.qty ?? null,
            unitPrice: inv?.unitPrice ?? po.unitPrice,
            amount: e.amount.toFixed(2),
            informational: e.informational,
            status: e.status,
            explanation: e.explanation,
          });
        }
      }
      return out.sort(
        (a, b) =>
          (a.receivedOn ?? '').localeCompare(b.receivedOn ?? '') ||
          a.poNumber.localeCompare(b.poNumber),
      );
    },
  );

  app.get(
    '/review',
    {
      schema: {
        summary: 'Documents waiting for a human check, with the reasons, oldest first',
        response: { 200: z.array(ReviewItem), ...errors },
      },
    },
    async () => {
      const docs = await db.document.findMany({
        where: { status: 'NEEDS_REVIEW' },
        orderBy: { createdAt: 'asc' },
        include: {
          vendor: true,
          set: true,
          extractions: { orderBy: { version: 'desc' }, take: 1 },
        },
      });
      return docs.map((d) => {
        const ex = d.extractions[0];
        const conf = (ex?.fieldConfidence ?? {}) as Record<string, number>;
        return {
          document: {
            id: d.id,
            status: d.status,
            type: d.type,
            docNumber: d.docNumber,
            poNumber: d.set?.poNumber ?? null,
            mimeType: d.mimeType,
            pages: d.pageCount,
            uploadedAt: d.createdAt.toISOString(),
            problem: null,
          },
          vendorName: d.vendor?.name ?? null,
          reasons: (ex?.reviewReasons ?? []) as string[],
          unsureFields: Object.values(conf).filter((c) => c < 0.8).length,
        };
      });
    },
  );

  app.post(
    '/exceptions/:id/decision',
    {
      schema: {
        summary: 'Approve, dispute, or write off a problem, with a required note',
        params: z.object({ id: z.string() }),
        body: Decision,
        response: { 200: ExceptionView, ...errors },
      },
    },
    async (req) => {
      const user = await currentUser();
      const r = await decideException(db, {
        exceptionId: req.params.id,
        action: req.body.action,
        note: req.body.note,
        userId: user.id,
      });
      await deps.events.publish({
        kind: 'exception',
        id: r.exception.id,
        poNumber: r.poNumber,
        status: r.exception.status,
      });
      const e = await db.exception.findUniqueOrThrow({
        where: { id: r.exception.id },
        include: {
          ...exceptionInclude,
          matchRun: { include: { set: { include: { vendor: true } } } },
        },
      });
      return exceptionView(e, {
        poNumber: r.poNumber,
        version: r.version,
        vendorName: e.matchRun.set.vendor?.name ?? null,
      });
    },
  );

  app.post(
    '/documents/:id/corrections',
    {
      schema: {
        summary: 'Correct fields the AI misread; saves a human version and re-matches the PO',
        params: z.object({ id: z.string() }),
        body: Correction,
        response: { 200: CorrectionResult, ...errors },
      },
    },
    async (req) => {
      const user = await currentUser();
      const r = await correctDocument(db, {
        documentId: req.params.id,
        fields: req.body.fields,
        userId: user.id,
      });
      for (const po of r.rematch) await deps.queues.enqueueMatch(po, 0);
      await deps.events.publish({
        kind: 'document',
        id: req.params.id,
        status: 'READY',
        ...(r.poNumber ? { poNumber: r.poNumber } : {}),
      });
      return { version: r.version, warnings: r.warnings, rematching: r.rematch };
    },
  );

  app.get(
    '/documents/:id/pages/:page',
    {
      // No response schema: the body is an image.
      schema: {
        summary: 'One page of a document as an image (for the highlight viewer)',
        params: z.object({ id: z.string(), page: z.coerce.number().int().min(1) }),
      },
    },
    async (req, reply) => {
      const d = await db.document.findUnique({ where: { id: req.params.id } });
      if (!d) throw new NotFound(`No document ${req.params.id}`);
      const img = await pageImage(deps.storage, d, req.params.page);
      if (!img) throw new NotFound(`Document ${req.params.id} has no page ${req.params.page}`);
      return reply
        .type(img.mimeType)
        .header('cache-control', 'private, max-age=86400, immutable')
        .send(Buffer.from(img.bytes));
    },
  );

  app.get(
    '/sets/:poNumber/history',
    {
      schema: {
        summary: 'Everything that happened to a PO, its documents, and its problems, oldest first',
        params: z.object({ poNumber: z.string() }),
        response: { 200: z.array(HistoryEntry), ...errors },
      },
    },
    async (req) => {
      const poNumber = req.params.poNumber.toUpperCase().replace(/\s+/g, '');
      const set = await db.documentSet.findUnique({
        where: { poNumber },
        include: {
          documents: { select: { id: true } },
          matchRuns: { select: { exceptions: { select: { id: true } } } },
        },
      });
      if (!set) throw new NotFound(`No PO ${req.params.poNumber}`);
      const events = await db.auditEvent.findMany({
        where: {
          OR: [
            { entityType: 'DocumentSet', entityId: set.id },
            { entityType: 'Document', entityId: { in: set.documents.map((d) => d.id) } },
            {
              entityType: 'Exception',
              entityId: { in: set.matchRuns.flatMap((r) => r.exceptions.map((e) => e.id)) },
            },
          ],
        },
        orderBy: { id: 'asc' },
      });
      const ctx = await historyContext(db, events);
      return events.map((e) => describe(e, ctx));
    },
  );

  app.get(
    '/overview',
    {
      schema: {
        summary: 'The numbers for the overview page: money at risk, counts, AI cost and speed',
        response: { 200: Overview, ...errors },
      },
    },
    async () => {
      const weekAgo = new Date(Date.now() - 7 * 86_400_000);
      const [sets, docs, decided, calls, recent] = await Promise.all([
        setsWithLatestRun(db),
        db.document.groupBy({ by: ['status'], _count: true }),
        db.exceptionActionRecord.count({ where: { createdAt: { gte: weekAgo } } }),
        db.llmCall.findMany({
          where: { purpose: 'EXTRACT', documentId: { not: null } },
          select: { documentId: true, costUsd: true, latencyMs: true, cacheHit: true },
        }),
        // "Started reading" is followed by "Read …"; the overview shows only the outcome.
        db.auditEvent.findMany({
          where: { action: { not: 'document.reading' } },
          orderBy: { id: 'desc' },
          take: 10,
        }),
      ]);
      const current = sets.flatMap((s) => s.matchRuns[0]?.exceptions ?? []);
      const open = current.filter((e) => e.status === 'OPEN');
      const atRisk = open.filter((e) => !e.informational);
      const byType = new Map<string, { count: number; cents: number }>();
      for (const e of atRisk) {
        const t = byType.get(e.type) ?? { count: 0, cents: 0 };
        t.count++;
        // Whole cents as integers: exact for display totals (ADR-0004).
        t.cents += Math.round(Number(e.amount.toFixed(2)) * 100);
        byType.set(e.type, t);
      }
      const totalCents = [...byType.values()].reduce((s, t) => s + t.cents, 0);
      const docCount = (st: string) => docs.find((d) => d.status === st)?._count ?? 0;

      const perDoc = new Map<string, { cost: number | null; ms: number }>();
      for (const c of calls) {
        const d = perDoc.get(c.documentId!) ?? { cost: 0, ms: 0 };
        d.cost = d.cost === null || c.costUsd === null ? null : d.cost + Number(c.costUsd);
        if (!c.cacheHit) d.ms += c.latencyMs;
        perDoc.set(c.documentId!, d);
      }
      const docsRead = perDoc.size;
      const costs = [...perDoc.values()].map((d) => d.cost);
      const seconds = [...perDoc.values()].filter((d) => d.ms > 0).map((d) => d.ms / 1000);
      const ctx = await historyContext(db, recent);
      return {
        moneyAtRisk: (totalCents / 100).toFixed(2),
        openProblems: atRisk.length,
        informational: open.length - atRisk.length,
        decidedThisWeek: decided,
        byType: [...byType.entries()]
          .map(([type, t]) => ({
            type: type as z.infer<typeof Overview>['byType'][number]['type'],
            count: t.count,
            amount: (t.cents / 100).toFixed(2),
          }))
          .sort((a, b) => Number(b.amount) - Number(a.amount)),
        sets: {
          total: sets.length,
          matched: sets.filter((s) => s.status === 'MATCHED').length,
          waiting: sets.filter((s) => s.status === 'WAITING').length,
          needsReview: sets.filter((s) => s.status === 'NEEDS_REVIEW').length,
        },
        documents: {
          total: docs.reduce((s, d) => s + d._count, 0),
          needsReview: docCount('NEEDS_REVIEW'),
          failed: docCount('FAILED'),
        },
        ai: {
          documentsRead: docsRead,
          costPerDocumentUsd:
            docsRead && costs.every((c) => c !== null)
              ? ((costs as number[]).reduce((s, c) => s + c, 0) / docsRead).toFixed(6)
              : null,
          medianSecondsPerDocument: median(seconds),
          slowestSeconds: seconds.length ? Math.max(...seconds) : null,
          cachedShare: calls.length ? calls.filter((c) => c.cacheHit).length / calls.length : 0,
        },
        recent: recent.map((e) => describe(e, ctx)),
      };
    },
  );

  app.get(
    '/events',
    {
      schema: {
        summary: 'Live feed of changes (server-sent events). Each message says what to refresh.',
      },
    },
    async (req, reply) => {
      reply.hijack();
      const res = reply.raw;
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      res.write('retry: 3000\n\n');
      const unsubscribe = await deps.events.subscribe((e) => {
        res.write(`event: change\ndata: ${JSON.stringify(e)}\n\n`);
      });
      const heartbeat = setInterval(() => res.write(': still here\n\n'), 25_000);
      req.raw.on('close', () => {
        clearInterval(heartbeat);
        void unsubscribe();
      });
    },
  );
}

/** Problems the rules refuse map to their HTTP status in the app's error handler. */
export const isActionRefused = (e: unknown): e is ActionRefused => e instanceof ActionRefused;
