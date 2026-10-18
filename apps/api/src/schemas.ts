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
      source: z.enum(['LLM', 'HUMAN']).describe('HUMAN after a correction'),
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
  vendorName: z.string().nullable(),
  decision: z
    .object({
      action: z.enum(['APPROVE', 'DISPUTE', 'WRITE_OFF']),
      note: z.string(),
      by: z.string(),
      at: z.string(),
    })
    .nullable()
    .describe('The latest human decision, if any'),
});

export const Line = z.object({
  docId: z.string(),
  docNumber: z.string().nullable(),
  lineNo: z.number(),
  sku: z.string().nullable(),
  description: z.string(),
  qty: z.number(),
  uom: z.string(),
  unitPrice: z.string().nullable(),
  lineTotal: z.string().nullable(),
});

export const ExceptionDetail = ExceptionView.extend({
  comparison: z
    .array(
      z.object({
        po: Line.nullable(),
        rr: Line.nullable(),
        invoice: Line.nullable(),
        method: z.string().nullable(),
        reason: z.string().nullable(),
      }),
    )
    .describe('Each involved line next to its partners on the other documents'),
  documents: z.array(
    z.object({
      id: z.string(),
      type: z.enum(['PO', 'RR', 'INVOICE']).nullable(),
      docNumber: z.string().nullable(),
    }),
  ),
});

export const Decision = z.object({
  action: z.enum(['APPROVE', 'DISPUTE', 'WRITE_OFF']),
  note: z.string().max(2000).describe('Required: why. Saved to the PO history.'),
});

export const Correction = z.object({
  fields: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .describe('Field path → corrected value, e.g. { "total": "1284.50", "lines.0.qty": 12 }'),
});

export const CorrectionResult = z.object({
  version: z.number(),
  warnings: z.array(z.string()).describe('Math checks that still fail after the correction'),
  rematching: z.array(z.string()).describe('PO numbers queued for re-matching'),
});

export const HistoryEntry = z.object({
  id: z.string(),
  at: z.string(),
  action: z.string(),
  actor: z.object({ type: z.enum(['USER', 'SYSTEM']), name: z.string().nullable() }),
  entityType: z.string(),
  entityId: z.string(),
  summary: z.string().describe('Plain-English description'),
  note: z.string().nullable(),
  poNumber: z.string().nullable(),
});

export const Overview = z.object({
  moneyAtRisk: z.string(),
  openProblems: z.number(),
  informational: z.number(),
  decidedThisWeek: z.number(),
  byType: z.array(z.object({ type: ExceptionType, count: z.number(), amount: z.string() })),
  sets: z.object({
    total: z.number(),
    matched: z.number(),
    waiting: z.number(),
    needsReview: z.number(),
  }),
  documents: z.object({ total: z.number(), needsReview: z.number(), failed: z.number() }),
  ai: z.object({
    documentsRead: z.number(),
    costPerDocumentUsd: z.string().nullable(),
    medianSecondsPerDocument: z.number().nullable(),
    slowestSeconds: z.number().nullable(),
    cachedShare: z.number().describe('Share of AI calls answered from saved answers (0–1)'),
  }),
  recent: z.array(HistoryEntry),
});

export const Me = z.object({ id: z.string(), name: z.string(), email: z.string() });

export const SetSummary = z.object({
  poNumber: z.string(),
  vendorName: z.string().nullable(),
  groupedInto: z
    .string()
    .nullable()
    .describe(
      'Set when this PO number looked misread and its documents were grouped into another PO',
    ),
  status: SetStatus,
  provisional: z.boolean(),
  notes: z.array(z.string()),
  waitingUntil: z.string().nullable(),
  documents: z.number(),
  openExceptions: z.number(),
});

export const SetListItem = SetSummary.extend({
  updatedAt: z.string(),
  moneyAtRisk: z.string().describe('Open, non-informational problems in the latest match'),
});

export const SetDetail = SetSummary.omit({ documents: true }).extend({
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
          lines: z.object({ po: Line.nullable(), rr: Line.nullable(), invoice: Line.nullable() }),
        }),
      ),
      exceptions: z.array(ExceptionView),
    })
    .nullable(),
});

export const UploadResult = z.object({ document: DocumentSummary, duplicate: z.boolean() });

export const ReviewItem = z.object({
  document: DocumentSummary,
  vendorName: z.string().nullable(),
  reasons: z.array(z.string()),
  unsureFields: z.number().describe('Fields read with confidence below 0.8'),
});
