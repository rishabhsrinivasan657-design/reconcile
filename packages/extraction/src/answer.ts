import { z } from 'zod';

/**
 * What the LLM must return (M3 design 3.2). Every field is { v, c, p, b }: value, confidence,
 * page, box.
 *
 * Lenient about *format*, strict about *meaning*: numbers sent as strings (and vice versa) are
 * coerced, a missing field becomes "not read" (null, confidence 0), and an unusable value becomes
 * null instead of failing the whole document. Meaning is checked later (math checks, dates,
 * required fields), and anything doubtful is flagged for review. Found on the first live run:
 * strict parsing failed 29 of 60 documents over such details.
 */
const asNumber = z.preprocess(
  (x) => (typeof x === 'string' && x.trim() !== '' && !Number.isNaN(Number(x)) ? Number(x) : x),
  z.number(),
);
const asString = z.preprocess((x) => (typeof x === 'number' ? String(x) : x), z.string());
const NOT_READ = { v: null, c: 0, p: 1, b: null };

const F = <T extends z.ZodType>(value: T) =>
  z.preprocess(
    (x) =>
      x === undefined || x === null
        ? NOT_READ
        : typeof x === 'object' && !Array.isArray(x)
          ? x
          : { v: x, c: 0.5, p: 1, b: null },
    z.object({
      v: value.nullable().catch(null),
      c: asNumber.catch(0).describe('your confidence 0-1 that v is exactly what is printed'),
      p: asNumber.catch(1).describe('1-based page number where the value is printed'),
      b: z
        .array(asNumber)
        .nullable()
        .catch(null)
        .describe('bounding box [ymin, xmin, ymax, xmax] on a 0-1000 scale, or null'),
    }),
  );

export const ExtractionAnswer = z.object({
  // Models sometimes wrap docType like the other fields ({ v: 'INVOICE', ... }); accept both.
  docType: z
    .preprocess(
      (x) => (x && typeof x === 'object' && 'v' in x ? (x as { v: unknown }).v : x),
      z.enum(['PO', 'RR', 'INVOICE']),
    )
    .describe('PURCHASE ORDER, RECEIVING REPORT, or INVOICE'),
  vendorName: F(asString),
  docNumber: F(asString).describe(
    'this document’s own number (PO number, receipt number, or invoice number)',
  ),
  poNumber: F(asString).describe('the PO number this document refers to; null on a purchase order'),
  date: F(asString).describe('the document date as YYYY-MM-DD'),
  dueDate: F(asString).describe('invoice due date as YYYY-MM-DD, else null'),
  lines: z
    .array(
      z.object({
        sku: F(asString),
        description: F(asString),
        qty: F(asNumber),
        uom: F(asString),
        unitPrice: F(asString).describe('as printed, e.g. "$1,234.56"; null if not printed'),
        lineTotal: F(asString),
      }),
    )
    .describe('every printed line item, in printed order, across all pages'),
  subtotal: F(asString),
  tax: F(asString),
  shipping: F(asString),
  total: F(asString),
});
export type ExtractionAnswer = z.infer<typeof ExtractionAnswer>;
export type AnswerField = ExtractionAnswer['vendorName'];
