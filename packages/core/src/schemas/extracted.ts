import { z } from 'zod';
import { DocType } from './enums.ts';
import type { TruthDocument } from './ground-truth.ts';
import { Cents, UnitPrice } from './money.ts';

/**
 * A document as read by extraction: field values only, no page locations (M2 AC-1).
 * M3's LLM extraction produces this shape; M2 builds it from answer keys.
 */
export const ExtractedLine = z.object({
  lineNo: z.int().min(1),
  sku: z.string().min(1).optional(),
  description: z.string().min(1),
  qty: z.int().min(0),
  uom: z.string().min(1),
  unitPrice: UnitPrice.optional(),
  lineTotal: Cents.optional(),
});
export type ExtractedLine = z.infer<typeof ExtractedLine>;

export const ExtractedDocument = z.object({
  /** Caller-chosen id: "S0010/inv-1" in evals, a database id later. */
  id: z.string().min(1),
  type: DocType,
  vendorName: z.string().min(1),
  docNumber: z.string().min(1),
  poNumber: z.string().min(1).optional(),
  date: z.iso.date(),
  dueDate: z.iso.date().optional(),
  lines: z.array(ExtractedLine).min(1),
  subtotal: Cents.optional(),
  tax: Cents.optional(),
  shipping: Cents.optional(),
  total: Cents.optional(),
});
export type ExtractedDocument = z.infer<typeof ExtractedDocument>;

/** Strip page/bbox wrappers from an answer-key document. */
export function fromTruthDocument(doc: TruthDocument, id: string): ExtractedDocument {
  const f = doc.fields;
  return ExtractedDocument.parse({
    id,
    type: doc.type,
    vendorName: f.vendorName.value,
    docNumber: f.docNumber.value,
    poNumber: f.poNumber?.value,
    date: f.date.value,
    dueDate: f.dueDate?.value,
    lines: f.lines.map((l) => ({
      lineNo: l.lineNo,
      sku: l.sku?.value,
      description: l.description.value,
      qty: l.qty.value,
      uom: l.uom.value,
      unitPrice: l.unitPrice?.value,
      lineTotal: l.lineTotal?.value,
    })),
    subtotal: f.subtotal?.value,
    tax: f.tax?.value,
    shipping: f.shipping?.value,
    total: f.total?.value,
  });
}
