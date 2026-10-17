import { z } from 'zod';

/** Response shapes: one definition checks answers AND generates the /docs manual (M4 AC-3). */
export const Problem = z
  .object({
    type: z.string(),
    title: z.string(),
    status: z.number(),
    detail: z.string().optional(),
  })
  .describe('An error, in the standard "problem JSON" shape (RFC 7807).');

export const DocStatus = z.enum([
  'UPLOADED',
  'EXTRACTING',
  'NEEDS_REVIEW',
  'READY',
  'MATCHED',
  'FAILED',
]);
export const SetStatus = z.enum(['WAITING', 'MATCHED', 'NEEDS_REVIEW']);
export const ExceptionType = z.enum([
  'SHORT_SHIP',
  'OVER_SHIP',
  'PRICE_VARIANCE',
  'QTY_BILLED_NOT_RECEIVED',
  'MISSING_DOCUMENT',
  'DUPLICATE_INVOICE',
  'UNMATCHED_LINE',
]);
export const ExceptionStatus = z.enum(['OPEN', 'APPROVED', 'DISPUTED', 'WRITTEN_OFF']);

export const DocumentSummary = z.object({
  id: z.string(),
  status: DocStatus,
  type: z.enum(['PO', 'RR', 'INVOICE']).nullable(),
  docNumber: z.string().nullable(),
  poNumber: z.string().nullable(),
  mimeType: z.string(),
  pages: z.number().nullable(),
  uploadedAt: z.string(),
});

export const DocumentDetail = DocumentSummary.extend({
  extraction: z
    .object({
      version: z.number(),
      model: z.string().nullable(),
      fields: z.unknown().describe('What the AI read (values only)'),
      confidence: z.record(z.string(), z.number()),
      locations: z.unknown(),
      needsReview: z.boolean(),
      reviewReasons: z.array(z.string()),
    })
    .nullable(),
  llm: z.object({
    calls: z.number(),
    costUsd: z.string().nullable(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    latencyMs: z.number(),
  }),
});

export const ExceptionView = z.object({
  id: z.string(),
  poNumber: z.string(),
  type: ExceptionType,
  status: ExceptionStatus,
  informational: z.boolean(),
  amount: z.string(),
  explanation: z.string(),
  lines: z.array(z.string()).describe('docId:lineNo of every line involved'),
  documentIds: z.array(z.string()),
  carriedOverFromId: z.string().nullable(),
  matchRunVersion: z.number(),
});

export const SetSummary = z.object({
  poNumber: z.string(),
  status: SetStatus,
  provisional: z.boolean(),
  notes: z.array(z.string()),
  waitingUntil: z.string().nullable(),
  documents: z.number(),
  openExceptions: z.number(),
});

export const SetDetail = SetSummary.extend({
  documents: z.array(DocumentSummary),
  match: z
    .object({
      version: z.number(),
      matchedAt: z.string(),
      lineMatches: z.array(
        z.object({
          po: z.string().nullable(),
          rr: z.string().nullable(),
          invoice: z.string().nullable(),
          method: z.string(),
          confidence: z.string().nullable(),
          reason: z.string().nullable(),
        }),
      ),
      exceptions: z.array(ExceptionView),
    })
    .nullable(),
});

export const UploadResult = z.object({ document: DocumentSummary, duplicate: z.boolean() });
