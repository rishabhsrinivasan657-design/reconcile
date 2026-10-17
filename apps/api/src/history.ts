import type { AuditEvent, PrismaClient } from '@reconcile/db';
import type { z } from 'zod';
import type { HistoryEntry } from './schemas.ts';

type Entry = z.infer<typeof HistoryEntry>;
type Json = Record<string, unknown> | null;

const TYPE_WORDS: Record<string, string> = {
  PO: 'purchase order',
  RR: 'receiving report',
  INVOICE: 'invoice',
};
const PROBLEM_WORDS: Record<string, string> = {
  SHORT_SHIP: 'short-ship',
  OVER_SHIP: 'over-ship',
  PRICE_VARIANCE: 'price over PO',
  QTY_BILLED_NOT_RECEIVED: 'billed, not received',
  MISSING_DOCUMENT: 'missing document',
  DUPLICATE_INVOICE: 'duplicate invoice',
  UNMATCHED_LINE: 'line not on PO',
};
const DECISION_WORDS: Record<string, string> = {
  APPROVE: 'Approved',
  DISPUTE: 'Disputed',
  WRITE_OFF: 'Wrote off',
};
const usd = (a: unknown) =>
  `$${Number(a).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Names for the things history entries point at, so summaries read like sentences. */
export interface HistoryContext {
  documents: Map<
    string,
    { type: string | null; docNumber: string | null; poNumber: string | null }
  >;
  sets: Map<string, string>;
  exceptions: Map<string, string>;
  users: Map<string, string>;
}

/** One history entry in plain English (M5 AC-6). */
export function describe(e: AuditEvent, ctx: HistoryContext): Entry {
  const after = e.after as Json;
  const doc = ctx.documents.get(e.entityId);
  const docName = doc?.type
    ? `${TYPE_WORDS[doc.type]} ${doc.docNumber ?? ''}`.trim()
    : 'a document';
  const s = (k: string) => (after?.[k] === undefined ? undefined : String(after[k]));
  let summary: string;
  let note: string | null = null;
  switch (e.action) {
    case 'document.uploaded':
      summary = `Uploaded ${doc?.type ? docName : 'a file'}`;
      break;
    case 'document.reading':
      summary = `Started reading ${docName}`;
      break;
    case 'document.extracted':
      summary = `Read ${docName}`;
      break;
    case 'document.flagged_for_review': {
      const reasons = (after?.reviewReasons as string[] | undefined) ?? [];
      summary = `Read ${docName}; needs a look${reasons.length ? `: ${reasons[0]}` : ''}`;
      break;
    }
    case 'document.failed':
      summary = `Couldn't read ${docName}`;
      break;
    case 'document.corrected': {
      const fields = Object.keys((after?.fields as object | undefined) ?? {});
      summary = `Corrected ${fields.join(', ')} on ${docName}`;
      break;
    }
    case 'exception.raised':
      summary = `Problem raised: ${PROBLEM_WORDS[s('type') ?? ''] ?? s('type')}, ${usd(after?.amount)}`;
      break;
    case 'exception.decided':
      summary = `${DECISION_WORDS[s('action') ?? ''] ?? 'Decided'} ${PROBLEM_WORDS[s('type') ?? ''] ?? 'a problem'} (${usd(after?.amount)})`;
      note = s('note') ?? null;
      break;
    case 'set.matched': {
      const n = Number(after?.exceptions ?? 0);
      summary = `Matched (version ${s('version')}): ${n === 0 ? 'no problems' : n === 1 ? '1 problem' : `${n} problems`}`;
      const notes = (after?.notes as string[] | undefined) ?? [];
      if (notes.length) note = notes.join(' ');
      break;
    }
    case 'set.waiting_for_documents':
      summary = 'Waiting for the missing documents (grace period)';
      break;
    case 'set.merged_into':
      summary = `Grouped with ${s('into')} (PO number 1 character apart)`;
      break;
    default:
      summary = e.action;
  }
  const poNumber =
    doc?.poNumber ?? ctx.sets.get(e.entityId) ?? ctx.exceptions.get(e.entityId) ?? null;
  return {
    id: e.id.toString(),
    at: e.createdAt.toISOString(),
    action: e.action,
    actor: {
      type: e.actorType,
      name: e.actorId ? (ctx.users.get(e.actorId) ?? null) : null,
    },
    entityType: e.entityType,
    entityId: e.entityId,
    summary,
    note,
    poNumber,
  };
}

/** Look up the names a batch of history entries refers to. */
export async function historyContext(
  db: PrismaClient,
  events: AuditEvent[],
): Promise<HistoryContext> {
  const ids = (t: string) => [
    ...new Set(events.filter((e) => e.entityType === t).map((e) => e.entityId)),
  ];
  const [docs, sets, exceptions, users] = await Promise.all([
    db.document.findMany({ where: { id: { in: ids('Document') } }, include: { set: true } }),
    db.documentSet.findMany({ where: { id: { in: ids('DocumentSet') } } }),
    db.exception.findMany({
      where: { id: { in: ids('Exception') } },
      include: { matchRun: { include: { set: true } } },
    }),
    db.user.findMany(),
  ]);
  return {
    documents: new Map(
      docs.map((d) => [
        d.id,
        { type: d.type, docNumber: d.docNumber, poNumber: d.set?.poNumber ?? null },
      ]),
    ),
    sets: new Map(sets.map((s) => [s.id, s.poNumber])),
    exceptions: new Map(exceptions.map((x) => [x.id, x.matchRun.set.poNumber])),
    users: new Map(users.map((u) => [u.id, u.name])),
  };
}
