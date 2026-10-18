import multipart from '@fastify/multipart';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { Document, PrismaClient } from '@reconcile/db';
import {
  ActionRefused,
  MAX_UPLOAD_BYTES,
  memoryEventBus,
  type EventBus,
  uploadDocument,
  UploadRejected,
  type Queues,
  type Storage,
} from '@reconcile/pipeline';
import Fastify, { type FastifyError } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  DocumentDetail,
  DocumentSummary,
  DocStatus,
  ExceptionDetail,
  ExceptionStatus,
  ExceptionType,
  ExceptionView,
  Problem,
  SetDetail,
  SetStatus,
  SetListItem,
  UploadResult,
} from './schemas.ts';
import {
  byImpact,
  exceptionInclude,
  exceptionView,
  linesOf,
  NotFound,
  problem,
  setsWithLatestRun,
} from './views.ts';
import { registerWorkRoutes } from './work-routes.ts';

export interface AppDeps {
  db: PrismaClient;
  storage: Storage;
  queues: Pick<Queues, 'enqueueRead' | 'enqueueMatch'>;
  /** Live announcements (ADR-0013). Defaults to an in-process bus (tests, no Redis). */
  events?: EventBus;
  /** Health check for Redis; omitted in tests that don't use it. */
  pingRedis?: () => Promise<unknown>;
}

/** The upload service (ADR-0011). Built as a function so tests can call it without a network. */
export async function buildApp(deps: AppDeps) {
  const app = Fastify({
    logger: false,
    bodyLimit: MAX_UPLOAD_BYTES + 1024 * 1024,
  }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES + 1, files: 1 } });
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Reconcile API',
        version: '0.6.0',
        description:
          'Upload purchase orders, receiving reports, and invoices; read the matches and problems Reconcile finds.',
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  // Every error comes back in one shape: problem JSON (M4 AC-3).
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const send = (status: number, title: string, detail?: string) =>
      reply
        .status(status)
        .type('application/problem+json')
        .send(problem(status, title, detail));
    if (hasZodFastifySchemaValidationErrors(err)) return send(400, 'Invalid request', err.message);
    if (err instanceof UploadRejected) return send(err.status, 'Upload rejected', err.message);
    if (err instanceof NotFound) return send(404, 'Not found', err.message);
    if (err instanceof ActionRefused)
      return send(err.status, err.status === 409 ? 'Conflict' : 'Not allowed', err.message);
    if (err.statusCode && err.statusCode < 500) return send(err.statusCode, err.name, err.message);
    return send(500, 'Something went wrong', 'The error was logged.');
  });
  app.setNotFoundHandler((req, reply) =>
    reply
      .status(404)
      .type('application/problem+json')
      .send(problem(404, 'Not found', `${req.method} ${req.url}`)),
  );

  const { db } = deps;
  const events = deps.events ?? memoryEventBus();
  const setPo = async (setId: string | null) =>
    setId
      ? ((await db.documentSet.findUnique({ where: { id: setId }, select: { poNumber: true } }))
          ?.poNumber ?? null)
      : null;
  const summary = async (d: Document): Promise<z.infer<typeof DocumentSummary>> => ({
    id: d.id,
    status: d.status,
    type: d.type,
    docNumber: d.docNumber,
    poNumber: await setPo(d.setId),
    mimeType: d.mimeType,
    pages: d.pageCount,
    uploadedAt: d.createdAt.toISOString(),
  });
  const errors = { 400: Problem, 404: Problem, 413: Problem, 415: Problem, 500: Problem };

  app.get(
    '/health',
    {
      schema: {
        summary: 'Is the service up?',
        response: { 200: z.object({ ok: z.boolean(), database: z.boolean(), queue: z.boolean() }) },
      },
    },
    async () => {
      const database = await db.$queryRaw`SELECT 1`.then(
        () => true,
        () => false,
      );
      const queue = deps.pingRedis
        ? await deps.pingRedis().then(
            () => true,
            () => false,
          )
        : true;
      return { ok: database && queue, database, queue };
    },
  );

  app.post(
    '/documents',
    {
      schema: {
        summary: 'Upload a PDF, PNG, or JPEG (form field "file", max 10 MB)',
        consumes: ['multipart/form-data'],
        response: {
          200: UploadResult.describe('Already uploaded: the existing document'),
          202: UploadResult.describe('Received; processing has started'),
          ...errors,
        },
      },
    },
    async (req, reply) => {
      const file = await req.file();
      if (!file) throw new UploadRejected('Send the document in a form field named "file".', 415);
      const bytes = new Uint8Array(await file.toBuffer());
      if (file.file.truncated) throw new UploadRejected('The file is over the 10 MB limit.', 413);
      const { document, duplicate } = await uploadDocument(db, deps.storage, bytes);
      if (!duplicate) {
        await deps.queues.enqueueRead(document.id);
        await events.publish({ kind: 'document', id: document.id, status: document.status });
      }
      return reply
        .status(duplicate ? 200 : 202)
        .send({ document: await summary(document), duplicate });
    },
  );

  app.get(
    '/documents',
    {
      schema: {
        summary: 'List documents, newest first',
        querystring: z.object({
          status: DocStatus.optional(),
          type: z.enum(['PO', 'RR', 'INVOICE']).optional(),
          limit: z.coerce.number().min(1).max(500).default(100),
        }),
        response: { 200: z.array(DocumentSummary), ...errors },
      },
    },
    async (req) => {
      const docs = await db.document.findMany({
        where: {
          ...(req.query.status ? { status: req.query.status } : {}),
          ...(req.query.type ? { type: req.query.type } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: req.query.limit,
      });
      return Promise.all(docs.map(summary));
    },
  );

  app.get(
    '/documents/:id',
    {
      schema: {
        summary: 'One document: what the AI read, how sure it was, and why it may need review',
        params: z.object({ id: z.string() }),
        response: { 200: DocumentDetail, ...errors },
      },
    },
    async (req) => {
      const d = await db.document.findUnique({ where: { id: req.params.id } });
      if (!d) throw new NotFound(`No document ${req.params.id}`);
      const ex = await db.extraction.findFirst({
        where: { documentId: d.id },
        orderBy: { version: 'desc' },
      });
      const calls = await db.llmCall.findMany({ where: { documentId: d.id } });
      const cost = calls.every((c) => c.costUsd !== null)
        ? calls.reduce((s, c) => s + Number(c.costUsd), 0)
        : null;
      return {
        ...(await summary(d)),
        extraction: ex
          ? {
              version: ex.version,
              source: ex.source,
              model: ex.model,
              fields: ex.data,
              confidence: ex.fieldConfidence as Record<string, number>,
              locations: ex.locations,
              needsReview: ex.needsReview,
              reviewReasons: ex.reviewReasons as string[],
            }
          : null,
        llm: {
          calls: calls.length,
          costUsd: cost === null ? null : cost.toFixed(6),
          inputTokens: calls.reduce((s, c) => s + c.inputTokens, 0),
          outputTokens: calls.reduce((s, c) => s + c.outputTokens, 0),
          latencyMs: calls.reduce((s, c) => s + c.latencyMs, 0),
        },
      };
    },
  );

  app.get(
    '/documents/:id/file',
    {
      // No response schema: the body is the raw file, not JSON.
      schema: { summary: 'The original uploaded file', params: z.object({ id: z.string() }) },
    },
    async (req, reply) => {
      const d = await db.document.findUnique({ where: { id: req.params.id } });
      if (!d) throw new NotFound(`No document ${req.params.id}`);
      return reply.type(d.mimeType).send(Buffer.from(await deps.storage.read(d.storagePath)));
    },
  );

  app.get(
    '/sets',
    {
      schema: {
        summary: 'Every PO set and its status',
        querystring: z.object({ status: SetStatus.optional() }),
        response: { 200: z.array(SetListItem), ...errors },
      },
    },
    async (req) => {
      const sets = await setsWithLatestRun(
        db,
        req.query.status ? { status: req.query.status } : {},
      );
      return sets.map((s) => ({
        poNumber: s.poNumber,
        vendorName: s.vendor?.name ?? null,
        updatedAt: s.updatedAt.toISOString(),
        moneyAtRisk: (
          (s.matchRuns[0]?.exceptions ?? [])
            .filter((e) => e.status === 'OPEN' && !e.informational)
            .reduce((c, e) => c + Math.round(Number(e.amount.toFixed(2)) * 100), 0) / 100
        ).toFixed(2),
        status: s.status,
        provisional: s.provisional,
        notes: s.notes as string[],
        waitingUntil: s.waitingUntil?.toISOString() ?? null,
        documents: s.documents.length,
        openExceptions:
          s.matchRuns[0]?.exceptions.filter((e) => e.status === 'OPEN' && !e.informational)
            .length ?? 0,
      }));
    },
  );

  app.get(
    '/sets/:poNumber',
    {
      schema: {
        summary: 'One PO: its documents, line matches (with AI reasons), and problems',
        params: z.object({ poNumber: z.string() }),
        response: { 200: SetDetail, ...errors },
      },
    },
    async (req) => {
      const [s] = await setsWithLatestRun(db, {
        poNumber: req.params.poNumber.toUpperCase().replace(/\s+/g, ''),
      });
      if (!s) throw new NotFound(`No PO ${req.params.poNumber}`);
      const run = s.matchRuns[0];
      // A grouped near-miss PO (misread number) keeps its document in its own set: include
      // every document the latest match actually used.
      const used = new Set(
        (run?.lineMatch ?? []).flatMap((m) =>
          [m.poLineKey, m.rrLineKey, m.invLineKey].filter(Boolean).map((k) => k!.split(':')[0]!),
        ),
      );
      const own = new Set(s.documents.map((d) => d.id));
      const extra = await db.document.findMany({
        where: { id: { in: [...used].filter((id) => !own.has(id)) } },
      });
      const docs = [...s.documents, ...extra];
      const lines = await linesOf(db, docs);
      return {
        poNumber: s.poNumber,
        vendorName: s.vendor?.name ?? null,
        status: s.status,
        provisional: s.provisional,
        notes: s.notes as string[],
        waitingUntil: s.waitingUntil?.toISOString() ?? null,
        openExceptions:
          run?.exceptions.filter((e) => e.status === 'OPEN' && !e.informational).length ?? 0,
        documents: await Promise.all(docs.map(summary)),
        match: run
          ? {
              version: run.version,
              matchedAt: run.createdAt.toISOString(),
              lineMatches: run.lineMatch.map((m) => ({
                po: m.poLineKey,
                rr: m.rrLineKey,
                invoice: m.invLineKey,
                lines: {
                  po: m.poLineKey ? (lines.get(m.poLineKey) ?? null) : null,
                  rr: m.rrLineKey ? (lines.get(m.rrLineKey) ?? null) : null,
                  invoice: m.invLineKey ? (lines.get(m.invLineKey) ?? null) : null,
                },
                method: m.method,
                confidence: m.confidence?.toFixed(4) ?? null,
                reason: m.reasoning,
              })),
              exceptions: run.exceptions
                .map((e) =>
                  exceptionView(e, {
                    poNumber: s.poNumber,
                    version: run.version,
                    vendorName: s.vendor?.name ?? null,
                  }),
                )
                .sort(byImpact),
            }
          : null,
      };
    },
  );

  app.get(
    '/exceptions',
    {
      schema: {
        summary: 'Current problems across all POs (latest match of each)',
        querystring: z.object({
          status: ExceptionStatus.optional(),
          type: ExceptionType.optional(),
          poNumber: z.string().optional(),
          includeInformational: z.coerce.boolean().default(true),
          sort: z
            .enum(['po', 'impact'])
            .default('po')
            .describe('impact: largest money at risk first'),
        }),
        response: { 200: z.array(ExceptionView), ...errors },
      },
    },
    async (req) => {
      const sets = await setsWithLatestRun(
        db,
        req.query.poNumber ? { poNumber: req.query.poNumber } : {},
      );
      const list = sets.flatMap((s) => {
        const run = s.matchRuns[0];
        if (!run) return [];
        return run.exceptions
          .filter(
            (e) =>
              (!req.query.status || e.status === req.query.status) &&
              (!req.query.type || e.type === req.query.type) &&
              (req.query.includeInformational || !e.informational),
          )
          .map((e) =>
            exceptionView(e, {
              poNumber: s.poNumber,
              version: run.version,
              vendorName: s.vendor?.name ?? null,
            }),
          );
      });
      return req.query.sort === 'impact' ? list.sort(byImpact) : list;
    },
  );

  app.get(
    '/exceptions/:id',
    {
      schema: {
        summary: 'One problem: its explanation, and each involved line next to its partners',
        params: z.object({ id: z.string() }),
        response: { 200: ExceptionDetail, ...errors },
      },
    },
    async (req) => {
      const e = await db.exception.findUnique({
        where: { id: req.params.id },
        include: {
          ...exceptionInclude,
          matchRun: { include: { set: { include: { vendor: true } }, lineMatch: true } },
        },
      });
      if (!e) throw new NotFound(`No exception ${req.params.id}`);
      const docIds = new Set(e.documentIds as string[]);
      const keys = new Set(e.lineKeys as string[]);
      const matches = e.matchRun.lineMatch.filter((m) =>
        [m.poLineKey, m.rrLineKey, m.invLineKey].some((k) => k && keys.has(k)),
      );
      for (const m of matches)
        for (const k of [m.poLineKey, m.rrLineKey, m.invLineKey])
          if (k) docIds.add(k.split(':')[0]!);
      const docs = await db.document.findMany({ where: { id: { in: [...docIds] } } });
      const lines = await linesOf(db, docs);
      const at = (k: string | null) => (k ? (lines.get(k) ?? null) : null);
      const paired = new Set(matches.flatMap((m) => [m.poLineKey, m.rrLineKey, m.invLineKey]));
      const typeOf = new Map(docs.map((d) => [d.id, d.type]));
      // Involved lines no line match covers (e.g. an extra invoice line) still get a row.
      const loose = [...keys]
        .filter((k) => !paired.has(k))
        .map((k) => {
          const t = typeOf.get(k.split(':')[0]!);
          return {
            po: t === 'PO' ? at(k) : null,
            rr: t === 'RR' ? at(k) : null,
            invoice: t === 'INVOICE' ? at(k) : null,
            method: null,
            reason: null,
          };
        });
      return {
        ...exceptionView(e, {
          poNumber: e.matchRun.set.poNumber,
          version: e.matchRun.version,
          vendorName: e.matchRun.set.vendor?.name ?? null,
        }),
        comparison: [
          ...matches.map((m) => ({
            po: at(m.poLineKey),
            rr: at(m.rrLineKey),
            invoice: at(m.invLineKey),
            method: m.method,
            reason: m.reasoning,
          })),
          ...loose,
        ],
        documents: docs.map((d) => ({ id: d.id, type: d.type, docNumber: d.docNumber })),
      };
    },
  );

  registerWorkRoutes(app, { db, storage: deps.storage, queues: deps.queues, events });

  return app;
}
