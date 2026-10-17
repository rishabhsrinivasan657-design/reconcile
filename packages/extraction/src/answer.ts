import { z } from 'zod';

/**
 * What the LLM must return (M3 design 3.2). Every field is { v, c, p, b }: value, confidence,
 * page, box. Kept compatible with strict JSON-schema modes: every key present, nulls instead of
 * missing keys, no numeric ranges (we clamp ourselves).
 */
const F = <T extends z.ZodType>(value: T) =>
  z.object({
    v: value.nullable(),
    c: z.number().describe('your confidence 0-1 that v is exactly what is printed'),
    p: z.number().describe('1-based page number where the value is printed'),
    b: z
      .array(z.number())
      .nullable()
      .describe('bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale, or null'),
  });

export const ExtractionAnswer = z.object({
  docType: z.enum(['PO', 'RR', 'INVOICE']).describe('PURCHASE ORDER, RECEIVING REPORT, or INVOICE'),
  vendorName: F(z.string()),
  docNumber: F(z.string()).describe(
    'this document’s own number (PO number, receipt number, or invoice number)',
  ),
  poNumber: F(z.string()).describe(
    'the PO number this document refers to; null on a purchase order',
  ),
  date: F(z.string()).describe('the document date as YYYY-MM-DD'),
  dueDate: F(z.string()).describe('invoice due date as YYYY-MM-DD, else null'),
  lines: z
    .array(
      z.object({
        sku: F(z.string()),
        description: F(z.string()),
        qty: F(z.number()),
        uom: F(z.string()),
        unitPrice: F(z.string()).describe('as printed, e.g. "$1,234.56"; null if not printed'),
        lineTotal: F(z.string()),
      }),
    )
    .describe('every printed line item, in printed order, across all pages'),
  subtotal: F(z.string()),
  tax: F(z.string()),
  shipping: F(z.string()),
  total: F(z.string()),
});
export type ExtractionAnswer = z.infer<typeof ExtractionAnswer>;
export type AnswerField = ExtractionAnswer['vendorName'];
