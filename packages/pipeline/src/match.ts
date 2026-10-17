import { createHash } from 'node:crypto';
import {
  ExtractedDocument,
  matchDocuments,
  normalizePo,
  withinOneEdit,
  type FuzzyMatcher,
  type LineRef,
  type MatchGroup,
} from '@reconcile/core';
import type { Prisma, PrismaClient, SetStatus } from '@reconcile/db';
import { audit } from './audit.ts';

const DAY_MS = 86_400_000;
const refKey = (r?: LineRef) => (r ? `${r.docId}:${r.lineNo}` : null);

/** Stable identity of "the same problem" across match runs: type + PO + exact lines/documents. */
export function fingerprint(poNumber: string, e: MatchGroup['exceptions'][number]): string {
  const what = e.lines.length
    ? e.lines.map((l) => `${l.docId}:${l.lineNo}`).sort()
    : [...e.documentIds].sort();
  return createHash('sha256')
    .update([e.type, poNumber, e.missing ?? '', ...what].join('|'))
    .digest('hex')
    .slice(0, 32);
}

export interface MatchOutcome {
  poNumber: string;
  status: SetStatus;
  provisional: boolean;
  /** Set when a document is missing but the grace period hasn't ended (re-check then). */
  waitingUntil?: Date;
  matchRunId?: string;
}

/**
 * "Match this PO" (M4 AC-5, AC-6, AC-14, AC-16). Collects the PO's documents, near-miss PO sets of
 * the same vendor (misread numbers), and the vendor's other invoices (duplicates); runs the
 * matcher; saves a new MatchRun; carries decisions over by fingerprint.
 */
export async function matchPurchaseOrder(
  db: PrismaClient,
  poNumberRaw: string,
  opts: { fuzzy?: FuzzyMatcher; graceDays: number; now?: Date },
): Promise<MatchOutcome[]> {
  const now = opts.now ?? new Date();
  const poNumber = normalizePo(poNumberRaw);
  const set = await db.documentSet.findUnique({
    where: { poNumber },
    include: { documents: true },
  });
  if (!set) return [];

  const vendorId = set.vendorId ?? set.documents.find((d) => d.vendorId)?.vendorId ?? null;
  const vendorSets = vendorId
    ? await db.documentSet.findMany({ where: { vendorId }, include: { documents: true } })
    : [set];
  const nearSets = vendorSets.filter((s) => s.id === set.id || withinOneEdit(s.poNumber, poNumber));
  const otherInvoices = vendorSets
    .filter((s) => !nearSets.includes(s))
    .flatMap((s) => s.documents.filter((d) => d.type === 'INVOICE'));
  const candidates = [...nearSets.flatMap((s) => s.documents), ...otherInvoices].filter(
    (d) => d.status === 'READY' || d.status === 'NEEDS_REVIEW' || d.status === 'MATCHED',
  );

  // Latest extraction of each document, as the matcher's input.
  const extracted = new Map<
    string,
    { doc: ExtractedDocument; needsReview: boolean; createdAt: Date }
  >();
  for (const d of candidates) {
    const ex = await db.extraction.findFirst({
      where: { documentId: d.id },
      orderBy: { version: 'desc' },
    });
    const parsed = ex ? ExtractedDocument.safeParse(ex.data) : undefined;
    if (parsed?.success)
      extracted.set(d.id, {
        doc: parsed.data,
        needsReview: ex!.needsReview,
        createdAt: d.createdAt,
      });
  }
  const result = await matchDocuments(
    [...extracted.values()].map((e) => e.doc),
    opts.fuzzy ? { fuzzy: opts.fuzzy } : {},
  );
  const nearDocIds = new Set(nearSets.flatMap((s) => s.documents.map((d) => d.id)));
  const groups = result.groups.filter((g) => g.documents.some((d) => nearDocIds.has(d.id)));

  const outcomes: MatchOutcome[] = [];
  for (const g of groups) {
    const docIds = g.documents.map((d) => d.id);
    const newest = Math.max(...docIds.map((id) => extracted.get(id)!.createdAt.getTime()));
    const graceEnds = new Date(newest + opts.graceDays * DAY_MS);
    const missing = g.exceptions.some((e) => e.type === 'MISSING_DOCUMENT');
    const waiting = missing && graceEnds > now;
    const exceptions = waiting
      ? g.exceptions.filter((e) => e.type !== 'MISSING_DOCUMENT')
      : g.exceptions;
    const provisional = g.notes.length > 0 || docIds.some((id) => extracted.get(id)!.needsReview);
    const status: SetStatus = waiting ? 'WAITING' : provisional ? 'NEEDS_REVIEW' : 'MATCHED';

    const outcome = await db.$transaction(async (tx) => {
      const target = await tx.documentSet.upsert({
        where: { poNumber: g.poNumber },
        update: {},
        create: { poNumber: g.poNumber, ...(vendorId ? { vendorId } : {}) },
      });
      const previous = await tx.matchRun.findFirst({
        where: { setId: target.id },
        orderBy: { version: 'desc' },
        include: { exceptions: true },
      });
      const run = await tx.matchRun.create({
        data: {
          setId: target.id,
          version: (previous?.version ?? 0) + 1,
          config: {
            fuzzy: opts.fuzzy ? 'custom' : 'text',
            graceDays: opts.graceDays,
            documents: docIds,
          } as Prisma.InputJsonValue,
        },
      });
      if (g.lineMatches.length) {
        await tx.lineMatch.createMany({
          data: g.lineMatches.map((m) => ({
            matchRunId: run.id,
            poLineKey: refKey(m.po),
            rrLineKey: refKey(m.rr),
            invLineKey: refKey(m.inv),
            method: m.method === 'FUZZY' ? 'FUZZY_LLM' : 'SKU',
            ...(m.confidence !== undefined ? { confidence: m.confidence.toFixed(4) } : {}),
            ...(m.reason ? { reasoning: m.reason } : {}),
          })),
        });
      }
      for (const e of exceptions) {
        const fp = fingerprint(g.poNumber, e);
        const prior = previous?.exceptions.find((x) => x.fingerprint === fp);
        const created = await tx.exception.create({
          data: {
            matchRunId: run.id,
            fingerprint: fp,
            type: e.type,
            // A human decision on the same problem carries over to the new run (M4 AC-5).
            status: prior && prior.status !== 'OPEN' ? prior.status : 'OPEN',
            ...(prior && prior.status !== 'OPEN' ? { carriedOverFromId: prior.id } : {}),
            informational: e.informational,
            amount: e.amount,
            explanation: e.explanation,
            lineKeys: e.lines.map((l) => `${l.docId}:${l.lineNo}`) as Prisma.InputJsonValue,
            documentIds: e.documentIds as Prisma.InputJsonValue,
          },
        });
        if (!prior) {
          await audit(tx, {
            action: 'exception.raised',
            entityType: 'Exception',
            entityId: created.id,
            after: { type: e.type, amount: e.amount, explanation: e.explanation },
          });
        }
      }
      await tx.documentSet.update({
        where: { id: target.id },
        data: {
          status,
          provisional,
          notes: g.notes as Prisma.InputJsonValue,
          waitingUntil: waiting ? graceEnds : null,
        },
      });
      await tx.document.updateMany({
        where: { id: { in: docIds }, status: 'READY' },
        data: { status: 'MATCHED' },
      });
      await audit(tx, {
        action: waiting ? 'set.waiting_for_documents' : 'set.matched',
        entityType: 'DocumentSet',
        entityId: target.id,
        after: {
          version: run.version,
          status,
          provisional,
          exceptions: exceptions.length,
          notes: g.notes,
        },
      });
      return {
        poNumber: g.poNumber,
        status,
        provisional,
        matchRunId: run.id,
        ...(waiting ? { waitingUntil: graceEnds } : {}),
      };
    });
    outcomes.push(outcome);

    // Sets merged into another group (a misread PO number) point to where their documents went.
    for (const s of nearSets) {
      if (s.poNumber !== g.poNumber && s.documents.some((d) => docIds.includes(d.id))) {
        await db.$transaction(async (tx) => {
          const note = `Grouped with ${g.poNumber} (PO number 1 character apart).`;
          await tx.documentSet.update({
            where: { id: s.id },
            data: { status: 'NEEDS_REVIEW', provisional: true, notes: [note] },
          });
          await audit(tx, {
            action: 'set.merged_into',
            entityType: 'DocumentSet',
            entityId: s.id,
            after: { into: g.poNumber },
          });
        });
      }
    }
  }
  return outcomes;
}
