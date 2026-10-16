import { z } from 'zod';
import { Cents, UnitPrice } from './money.ts';
import { DocRole, DocType, ExceptionType, LineKey, PlantedErrorType } from './enums.ts';

/** Where a value was drawn: page (1-based) and a box normalized to [0,1], origin top-left. */
export const FieldLocation = z.object({
  page: z.int().min(1),
  bbox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .refine(
      ([x0, y0, x1, y1]) => [x0, y0, x1, y1].every((n) => n >= 0 && n <= 1),
      'bbox outside [0,1]',
    )
    .refine(([x0, y0, x1, y1]) => x0 < x1 && y0 < y1, 'bbox has no area'),
});

const field = <T extends z.ZodType>(value: T) => FieldLocation.extend({ value });

const IsoDate = z.iso.date();

export const LineFields = z.object({
  lineNo: z.int().min(1),
  /** Absent when the SKU was omitted from the document (planted `sku_omitted`). */
  sku: field(z.string().min(1)).optional(),
  description: field(z.string().min(1)),
  qty: field(z.int().min(0)),
  uom: field(z.string().min(1)),
  /** Absent on receiving reports: a warehouse doesn't see prices. */
  unitPrice: field(UnitPrice).optional(),
  lineTotal: field(Cents).optional(),
});
export type LineFields = z.infer<typeof LineFields>;

export const DocumentFields = z.object({
  vendorName: field(z.string().min(1)),
  docNumber: field(z.string().min(1)),
  /** The PO this document refers to (RR and invoices). */
  poNumber: field(z.string().min(1)).optional(),
  /** Canonical ISO date; the document shows it in the vendor's own format. */
  date: field(IsoDate),
  dueDate: field(IsoDate).optional(),
  currency: field(z.literal('USD')).optional(),
  lines: z.array(LineFields).min(1),
  subtotal: field(Cents).optional(),
  tax: field(Cents).optional(),
  shipping: field(Cents).optional(),
  total: field(Cents).optional(),
});
export type DocumentFields = z.infer<typeof DocumentFields>;

export const TruthDocument = z
  .object({
    file: z.string().regex(/^[\w.-]+\.(pdf|png)$/),
    role: DocRole,
    type: DocType,
    format: z.enum(['pdf', 'png']),
    template: z.string().min(1),
    pages: z.int().min(1),
    fields: DocumentFields,
  })
  .superRefine((doc, ctx) => {
    const hasPrices = doc.fields.lines.some((l) => l.unitPrice || l.lineTotal);
    if (doc.type === 'RR' && hasPrices) {
      ctx.addIssue({ code: 'custom', message: 'receiving reports carry no prices' });
    }
    if (doc.type === 'INVOICE' && !(doc.fields.subtotal && doc.fields.total && doc.fields.tax)) {
      ctx.addIssue({ code: 'custom', message: 'invoices need subtotal, tax, and total' });
    }
  });
export type TruthDocument = z.infer<typeof TruthDocument>;

/** One logical line across documents. A side is absent when that document lacks the line. */
export const TruthLineMatch = z
  .object({ po: LineKey.optional(), rr: LineKey.optional(), inv: LineKey.optional() })
  .refine((m) => [m.po, m.rr, m.inv].filter(Boolean).length >= 1, 'empty line match');
export type TruthLineMatch = z.infer<typeof TruthLineMatch>;

export const TruthException = z.object({
  type: ExceptionType,
  lineKeys: z.array(LineKey),
  documentRoles: z.array(DocRole),
  /** PRD FR-09 impact; "0.00" when informational. */
  amount: Cents,
  informational: z.boolean(),
});
export type TruthException = z.infer<typeof TruthException>;

export const PlantedError = z.object({
  type: PlantedErrorType,
  lineKeys: z.array(LineKey),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
});
export type PlantedError = z.infer<typeof PlantedError>;

/** The answer key written next to every generated document set (ADR-0008). */
export const GroundTruth = z.object({
  schemaVersion: z.literal(1),
  setId: z.string().regex(/^S\d{4}$/),
  seed: z.int(),
  generatorVersion: z.string(),
  poNumber: z.string(),
  vendorCode: z.string(),
  documents: z.array(TruthDocument).min(1),
  /** Lines of the PO, RR, and primary invoice (`inv-1`). Duplicates are flagged, not matched. */
  lineMatches: z.array(TruthLineMatch),
  exceptions: z.array(TruthException),
  planted: z.array(PlantedError),
});
export type GroundTruth = z.infer<typeof GroundTruth>;
