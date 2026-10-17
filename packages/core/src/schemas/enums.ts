import { z } from 'zod';

export const DocType = z.enum(['PO', 'RR', 'INVOICE']);
export type DocType = z.infer<typeof DocType>;

/** A document's role within its set: the PO, the receiving report, or invoice #n. */
export const DocRole = z.string().regex(/^(po|rr|inv-\d+)$/, 'must be po, rr, or inv-<n>');
export type DocRole = z.infer<typeof DocRole>;

/** `<role>:<1-based line number>`, e.g. `po:3`, `inv-1:5`. Shared by DB rows and answer keys. */
export const LineKey = z.string().regex(/^(po|rr|inv-\d+):\d+$/, 'must look like po:3 or inv-1:5');
export type LineKey = z.infer<typeof LineKey>;

export const lineKey = (role: string, lineNo: number): LineKey => `${role}:${lineNo}`;

/** PRD FR-09. */
export const ExceptionType = z.enum([
  'SHORT_SHIP',
  'OVER_SHIP',
  'PRICE_VARIANCE',
  'QTY_BILLED_NOT_RECEIVED',
  'MISSING_DOCUMENT',
  'DUPLICATE_INVOICE',
  'UNMATCHED_LINE',
]);
export type ExceptionType = z.infer<typeof ExceptionType>;

/** Errors the synthetic generator can plant (M1 AC-12). */
export const PlantedErrorType = z.enum([
  'short_ship_billed_full',
  'short_ship_billed_correctly',
  'over_ship',
  'billed_not_received',
  'price_change',
  'description_typo',
  'sku_omitted',
  'extra_invoice_line',
  'missing_document',
  'duplicate_invoice',
  // Appended last so earlier types keep their random streams (generator 0.3.0, M2 AC-16).
  'price_noise',
  // Vendor's own product wording, no SKU (generator 0.5.0, M4 AC-15).
  'vendor_name',
]);
export type PlantedErrorType = z.infer<typeof PlantedErrorType>;
