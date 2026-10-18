import { normalizePo, ExtractedDocument } from '@reconcile/core';
import type { ExceptionActionType, Prisma, PrismaClient } from '@reconcile/db';
import {
  checkDocument,
  parseIsoDate,
  parseMoney,
  toCentsString,
  toUnitPriceString,
} from '@reconcile/extraction';
import { audit } from './audit.ts';
import { poNumberOf } from './read.ts';

/** A human action the rules don't allow; `status` is the HTTP status the API answers with. */
export class ActionRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

const STATUS_FOR: Record<ExceptionActionType, 'APPROVED' | 'DISPUTED' | 'WRITTEN_OFF'> = {
  APPROVE: 'APPROVED',
  DISPUTE: 'DISPUTED',
  WRITE_OFF: 'WRITTEN_OFF',
};

/**
 * Approve, dispute, or write off a problem with a required note (M5 AC-1). The decision record,
 * the status change, and the history entry are saved in one transaction.
 */
export async function decideException(
  db: PrismaClient,
  input: { exceptionId: string; action: ExceptionActionType; note: string; userId: string },
) {
  const note = input.note.trim();
  if (!note) throw new ActionRefused('Add a note: it goes in the PO history.', 400);
  return db.$transaction(async (tx) => {
    const e = await tx.exception.findUnique({
      where: { id: input.exceptionId },
      include: { matchRun: { include: { set: true } }, actions: { include: { user: true } } },
    });
    if (!e) throw new ActionRefused(`No problem ${input.exceptionId}`, 404);
    const latest = await tx.matchRun.findFirst({
      where: { setId: e.matchRun.setId },
      orderBy: { version: 'desc' },
      select: { id: true },
    });
    if (latest?.id !== e.matchRunId)
      throw new ActionRefused(
        'This PO was re-matched since. Reload to see its current problems.',
        409,
      );
    if (e.status !== 'OPEN') {
      const last = e.actions.at(-1);
      throw new ActionRefused(
        `Already decided${last ? ` by ${last.user.name}` : ''}: ${e.status.toLowerCase().replace('_', ' ')}.`,
        409,
      );
    }
    const status = STATUS_FOR[input.action];
    await tx.exceptionActionRecord.create({
      data: { exceptionId: e.id, userId: input.userId, action: input.action, note },
    });
    const updated = await tx.exception.update({ where: { id: e.id }, data: { status } });
    await audit(tx, {
      action: 'exception.decided',
      entityType: 'Exception',
      entityId: e.id,
      userId: input.userId,
      before: { status: e.status },
      after: { status, action: input.action, note, type: e.type, amount: e.amount.toFixed(2) },
    });
    return { exception: updated, poNumber: e.matchRun.set.poNumber, version: e.matchRun.version };
  });
}

const TEXT = new Set(['vendorName', 'docNumber', 'poNumber']);
const CENTS = new Set(['subtotal', 'tax', 'shipping', 'total']);
const DATES = new Set(['date', 'dueDate']);
const LINE_TEXT = new Set(['sku', 'description', 'uom']);

/** Apply one corrected value at a field path like "total" or "lines.0.qty". */
function applyField(doc: Record<string, unknown>, key: string, raw: string | number) {
  const bad = (why: string) => new ActionRefused(`${key}: ${why}`, 400);
  const text = String(raw).trim();
  const line = /^lines\.(\d+)\.(\w+)$/.exec(key);
  if (line) {
    const lines = doc.lines as Record<string, unknown>[];
    const l = lines[Number(line[1])];
    const f = line[2]!;
    if (!l) throw bad('there is no such line');
    if (LINE_TEXT.has(f)) {
      if (!text) throw bad('can’t be empty');
      l[f] = text;
    } else if (f === 'qty') {
      if (!/^\d+$/.test(text)) throw bad('must be a whole number');
      l.qty = Number(text);
    } else if (f === 'unitPrice' || f === 'lineTotal') {
      const d = parseMoney(text);
      if (!d || d.isNegative()) throw bad('must be an amount like 12.50');
      l[f] = f === 'unitPrice' ? toUnitPriceString(d) : toCentsString(d);
    } else throw bad('this field can’t be corrected');
    return;
  }
  if (TEXT.has(key)) {
    if (!text) throw bad('can’t be empty');
    doc[key] = text;
  } else if (CENTS.has(key)) {
    const d = parseMoney(text);
    if (!d || d.isNegative()) throw bad('must be an amount like 12.50');
    doc[key] = toCentsString(d);
  } else if (DATES.has(key)) {
    const d = parseIsoDate(text);
    if (!d) throw bad('must be a date like 2026-03-12');
    doc[key] = d;
  } else throw bad('this field can’t be corrected');
}

/**
 * Correct fields the AI misread (M5 AC-2). Saves a new Extraction version marked HUMAN (the AI's
 * version is kept), re-runs the math checks, marks the document ready, and moves it to another PO
 * set if its PO number changed. Returns the PO numbers to re-match.
 */
export async function correctDocument(
  db: PrismaClient,
  input: { documentId: string; fields: Record<string, string | number>; userId: string },
) {
  const keys = Object.keys(input.fields);
  if (!keys.length) throw new ActionRefused('Send at least one field to correct.', 400);
  const docRow = await db.document.findUnique({ where: { id: input.documentId } });
  if (!docRow) throw new ActionRefused(`No document ${input.documentId}`, 404);
  const latest = await db.extraction.findFirst({
    where: { documentId: docRow.id },
    orderBy: { version: 'desc' },
  });
  const current = latest ? ExtractedDocument.safeParse(latest.data) : undefined;
  if (!latest || !current?.success)
    throw new ActionRefused(
      'This document couldn’t be read well enough to correct field by field.',
      409,
    );

  const draft = structuredClone(current.data) as unknown as Record<string, unknown>;
  const before: Record<string, unknown> = {};
  for (const k of keys) {
    before[k] = k.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)?.[p], draft);
    applyField(draft, k, input.fields[k]!);
  }
  const parsed = ExtractedDocument.safeParse(draft);
  if (!parsed.success) throw new ActionRefused('The corrected document isn’t complete.', 400);
  const doc = parsed.data;
  const warnings = checkDocument(doc);
  const confidence = { ...(latest.fieldConfidence as Record<string, number>) };
  for (const k of keys) confidence[k] = 1;
  const poNumber = poNumberOf(doc);
  const previousPo = docRow.setId
    ? (await db.documentSet.findUnique({ where: { id: docRow.setId } }))?.poNumber
    : undefined;

  const version = await db.$transaction(async (tx) => {
    const v = latest.version + 1;
    const set = poNumber
      ? await tx.documentSet.upsert({
          where: { poNumber },
          update: {},
          create: { poNumber, ...(docRow.vendorId ? { vendorId: docRow.vendorId } : {}) },
        })
      : undefined;
    await tx.extraction.create({
      data: {
        documentId: docRow.id,
        version: v,
        source: 'HUMAN',
        data: doc as unknown as Prisma.InputJsonValue,
        fieldConfidence: confidence,
        ...(latest.locations ? { locations: latest.locations as Prisma.InputJsonValue } : {}),
        // A person checked it: what's left are warnings to show, not a reason to hold it back.
        reviewReasons: warnings,
        needsReview: false,
      },
    });
    await tx.document.update({
      where: { id: docRow.id },
      data: {
        status: 'READY',
        type: doc.type,
        docNumber: doc.docNumber,
        ...(set ? { setId: set.id } : {}),
      },
    });
    await audit(tx, {
      action: 'document.corrected',
      entityType: 'Document',
      entityId: docRow.id,
      userId: input.userId,
      before,
      after: { version: v, fields: input.fields, warnings },
    });
    return v;
  });
  const rematch = [...new Set([poNumber, previousPo].filter((p): p is string => Boolean(p)))].map(
    normalizePo,
  );
  return { version, warnings, poNumber, rematch };
}
