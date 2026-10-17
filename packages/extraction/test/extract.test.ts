import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ExtractionAnswer } from '../src/answer.ts';
import { buildResult } from '../src/extract.ts';
import { convertBox, parseIsoDate, parseMoney, toUnitPriceString } from '../src/normalize.ts';
import { EXTRACT_PROMPT } from '../src/prompt.ts';

const f = <T>(v: T, c = 0.95) => ({ v, c, p: 1, b: [100, 200, 120, 300] });
const answer = (over: Partial<ExtractionAnswer> = {}): ExtractionAnswer => ({
  docType: 'INVOICE',
  vendorName: f('Sunpeak Foods Co.'),
  docNumber: f('INV-41668'),
  poNumber: f('HP-PO-104157'),
  date: f('2026-03-28'),
  dueDate: f('2026-04-27'),
  lines: [
    {
      sku: f('SP-1'),
      description: f('Sunpeak Crunchy Almond Butter, 12 oz'),
      qty: f(10),
      uom: f('CS'),
      unitPrice: f('$5.00'),
      lineTotal: f('$50.00'),
    },
    {
      sku: f(null),
      description: f('Sunpeak Creamy Peanut Butter, 16 oz'),
      qty: f(2),
      uom: f('CS'),
      unitPrice: f('1,234.50'),
      lineTotal: f('2,469.00'),
    },
  ],
  subtotal: f('$2,519.00'),
  tax: f('$0.00'),
  shipping: f('$25.00'),
  total: f('$2,544.00'),
  ...over,
});

describe('normalization (AC-6, AC-7)', () => {
  it('parses printed money into decimal strings', () => {
    expect(parseMoney('$1,234.56')!.toFixed(2)).toBe('1234.56');
    expect(parseMoney('(12.00)')!.toFixed(2)).toBe('-12.00');
    expect(parseMoney('twelve')).toBeNull();
    expect(toUnitPriceString(parseMoney('0.0425')!)).toBe('0.0425');
    expect(toUnitPriceString(parseMoney('4.8')!)).toBe('4.80');
  });
  it('accepts real dates in ISO and common printed formats', () => {
    expect(parseIsoDate('2026-02-28')).toBe('2026-02-28');
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('02/28/2026')).toBe('2026-02-28');
    expect(parseIsoDate('September 4, 2026')).toBe('2026-09-04');
    expect(parseIsoDate('04-SEP-2026')).toBe('2026-09-04');
    expect(parseIsoDate('Sep 4 2026')).toBe('2026-09-04');
    expect(parseIsoDate('Smarch 4, 2026')).toBeNull();
    expect(parseIsoDate('soon')).toBeNull();
  });
  it('converts [ymin,xmin,ymax,xmax] 0-1000 boxes to [x0,y0,x1,y1] 0-1', () => {
    expect(convertBox([100, 200, 120, 300])).toEqual([0.2, 0.1, 0.3, 0.12]);
    expect(convertBox([5, 5, 5, 5])).toBeUndefined();
    expect(convertBox(null)).toBeUndefined();
  });
});

describe('buildResult (AC-6..AC-8)', () => {
  it('a clean, consistent answer becomes a document with no review needed', () => {
    const r = buildResult(answer(), 'S0001/inv-1');
    expect(r.needsReview).toBe(false);
    expect(r.document).toMatchObject({
      type: 'INVOICE',
      total: '2544.00',
      lines: [
        { lineNo: 1, sku: 'SP-1', unitPrice: '5.00', lineTotal: '50.00' },
        { lineNo: 2, unitPrice: '1234.50' },
      ],
    });
    expect(r.document!.lines[1]!.sku).toBeUndefined();
    expect(r.locations.total).toEqual({ page: 1, bbox: [0.2, 0.1, 0.3, 0.12] });
  });

  it('a line whose math fails halves the confidence of its fields and flags review', () => {
    const bad = answer();
    bad.lines[0]!.lineTotal = f('$55.00');
    const r = buildResult(bad, 'x');
    expect(r.needsReview).toBe(true);
    expect(r.reviewReasons.join(' ')).toMatch(/10 × 5.00 = 50.00, but the line total reads 55.00/);
    // The wrong line total also breaks the subtotal check, so it is halved twice.
    expect(r.reviewReasons.join(' ')).toMatch(
      /line totals add up to 2524.00, but the subtotal reads 2519.00/,
    );
    expect(r.confidence['lines.0.lineTotal']).toBeCloseTo(0.2375);
    expect(r.confidence['lines.0.qty']).toBeCloseTo(0.475);
    expect(r.confidence['lines.1.qty']).toBe(0.95);
  });

  it('totals that do not add up are flagged', () => {
    const r = buildResult(answer({ total: f('$2,600.00') }), 'x');
    expect(r.reviewReasons.join(' ')).toMatch(/but the total reads 2600.00/);
    expect(r.confidence.total).toBeCloseTo(0.475);
  });

  it('low model confidence alone flags review', () => {
    const a = answer();
    a.lines[1]!.qty = f(2, 0.4);
    const r = buildResult(a, 'x');
    expect(r.needsReview).toBe(true);
    expect(r.reviewReasons.at(-1)).toBe('low confidence: lines.1.qty');
  });

  it('missing required fields leave no document and flag review', () => {
    const r = buildResult(answer({ docNumber: f(null) }), 'x');
    expect(r.document).toBeUndefined();
    expect(r.needsReview).toBe(true);
  });

  it('an invalid date is dropped with a reason', () => {
    const r = buildResult(answer({ dueDate: f('2026-02-30') }), 'x');
    expect(r.document!.dueDate).toBeUndefined();
    expect(r.reviewReasons[0]).toMatch(/dueDate: "2026-02-30" is not a real/);
  });
});

describe('prompt lock (AC-3)', () => {
  it('a prompt text change requires a version bump', () => {
    const lock = JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, '../prompts.lock.json'), 'utf8'),
    ) as Record<string, string>;
    const hash = createHash('sha256')
      .update(EXTRACT_PROMPT.system + EXTRACT_PROMPT.jsonShape + EXTRACT_PROMPT.user(1))
      .digest('hex');
    expect(
      lock[EXTRACT_PROMPT.version],
      `Prompt ${EXTRACT_PROMPT.version} changed. Bump its version (cached answers must not be reused), then record the new hash in prompts.lock.json.`,
    ).toBe(hash);
  });
});

describe('lenient answer parsing (found on the first live run)', () => {
  it('coerces number/string mix-ups and treats missing or junk fields as not read', () => {
    const raw = {
      docType: { v: 'INVOICE', c: 1, p: 1, b: null },
      vendorName: { v: 'Sunpeak', c: '0.9', p: '1', b: ['10', 20, 30, 40] },
      docNumber: 'INV-1',
      date: { v: '2026-03-28', c: 1, p: 1, b: null },
      lines: [
        {
          description: { v: 'Almond Butter', c: 1, p: 1, b: null },
          qty: { v: '28', c: 1, p: 1, b: null },
          uom: { v: 'CS', c: 1, p: 1, b: null },
          unitPrice: { v: 5, c: 1, p: 1, b: null },
        },
      ],
      total: { v: { weird: true }, c: 1, p: 1, b: null },
    };
    const a = ExtractionAnswer.parse(raw);
    expect(a.vendorName).toEqual({ v: 'Sunpeak', c: 0.9, p: 1, b: [10, 20, 30, 40] });
    expect(a.docNumber.v).toBe('INV-1');
    expect(a.lines[0]!.qty.v).toBe(28);
    expect(a.lines[0]!.unitPrice.v).toBe('5');
    expect(a.lines[0]!.sku).toEqual({ v: null, c: 0, p: 1, b: null });
    expect(a.total.v).toBeNull();
    expect(a.tax.v).toBeNull();
  });

  it('on a purchase order, a PO number given only as poNumber becomes the document number', () => {
    const r = buildResult(
      answer({
        docType: 'PO',
        docNumber: f(null),
        poNumber: f('HP-PO-104012'),
        dueDate: f(null),
        tax: f(null),
        shipping: f(null),
        total: f('$2,519.00'),
      }),
      'S0001/po',
    );
    expect(r.document?.docNumber).toBe('HP-PO-104012');
    expect(r.document?.poNumber).toBeUndefined();
    expect(r.confidence.docNumber).toBe(0.95);
  });
});
