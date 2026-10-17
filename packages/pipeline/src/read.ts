import { normalizePo, normalizeVendor, type ExtractedDocument } from '@reconcile/core';
import type { DocStatus, Prisma, PrismaClient } from '@reconcile/db';
import { extractDocument, type InputMime } from '@reconcile/extraction';
import type { LlmClient } from '@reconcile/llm';
import { audit } from './audit.ts';
import type { Storage } from './storage.ts';

/** The PO number a document belongs to: a PO's own number, or the PO an RR/invoice refers to. */
export const poNumberOf = (d: ExtractedDocument) =>
  d.type === 'PO' ? normalizePo(d.docNumber) : d.poNumber ? normalizePo(d.poNumber) : undefined;

/**
 * "Read this document" (M4 AC-4): extract with the LLM, save a new Extraction version, fill in
 * the document's type/number/vendor/PO set, and mark it ready or needing review.
 * Returns the PO number to match next (if one could be read).
 */
export async function readDocument(
  db: PrismaClient,
  deps: { storage: Storage; llm: LlmClient; reviewThreshold?: number },
  documentId: string,
): Promise<{ status: DocStatus; poNumber?: string }> {
  const doc = await db.document.findUniqueOrThrow({ where: { id: documentId } });
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id: doc.id }, data: { status: 'EXTRACTING' } });
    await audit(tx, { action: 'document.reading', entityType: 'Document', entityId: doc.id });
  });

  const bytes = await deps.storage.read(doc.storagePath);
  const result = await extractDocument(bytes, {
    llm: deps.llm,
    id: doc.id,
    mime: doc.mimeType as InputMime,
    ...(deps.reviewThreshold !== undefined ? { reviewThreshold: deps.reviewThreshold } : {}),
  });
  const d = result.document;
  const poNumber = d ? poNumberOf(d) : undefined;
  const vendors = d ? await db.vendor.findMany({ select: { id: true, name: true } }) : [];
  const vendor = d
    ? vendors.find((v) => normalizeVendor(v.name) === normalizeVendor(d.vendorName))
    : undefined;
  // Unreadable documents still need a human: there's nothing to match yet.
  const status: DocStatus = d && !result.needsReview ? 'READY' : 'NEEDS_REVIEW';

  await db.$transaction(async (tx) => {
    const version = (await tx.extraction.count({ where: { documentId: doc.id } })) + 1;
    const set = poNumber
      ? await tx.documentSet.upsert({
          where: { poNumber },
          update: vendor ? { vendorId: vendor.id } : {},
          create: { poNumber, ...(vendor ? { vendorId: vendor.id } : {}) },
        })
      : undefined;
    await tx.extraction.create({
      data: {
        documentId: doc.id,
        version,
        source: 'LLM',
        promptVersion: result.llm.provider + '/' + result.llm.model,
        model: result.llm.model,
        data: (d ?? {}) as Prisma.InputJsonValue,
        fieldConfidence: result.confidence as Prisma.InputJsonValue,
        locations: result.locations as unknown as Prisma.InputJsonValue,
        reviewReasons: result.reviewReasons as Prisma.InputJsonValue,
        needsReview: result.needsReview,
      },
    });
    await tx.document.update({
      where: { id: doc.id },
      data: {
        status,
        pageCount: result.pages,
        ...(d ? { type: d.type, docNumber: d.docNumber } : {}),
        ...(vendor ? { vendorId: vendor.id } : {}),
        ...(set ? { setId: set.id } : {}),
      },
    });
    await audit(tx, {
      action: status === 'READY' ? 'document.extracted' : 'document.flagged_for_review',
      entityType: 'Document',
      entityId: doc.id,
      after: {
        version,
        type: d?.type,
        docNumber: d?.docNumber,
        poNumber,
        reviewReasons: result.reviewReasons,
      },
    });
  });
  return { status, ...(poNumber ? { poNumber } : {}) };
}

export async function markFailed(
  db: PrismaClient,
  documentId: string,
  reason: string,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.document.update({ where: { id: documentId }, data: { status: 'FAILED' } });
    await audit(tx, {
      action: 'document.failed',
      entityType: 'Document',
      entityId: documentId,
      after: { reason: reason.slice(0, 500) },
    });
  });
}
