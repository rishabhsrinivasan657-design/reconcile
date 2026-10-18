import type { ExtractedDocument } from '@reconcile/core';
import { describe, expect, it } from 'vitest';
import { checkDocument } from '../src/checks.ts';

const doc = (over: Partial<ExtractedDocument> = {}): ExtractedDocument => ({
  id: 'd',
  type: 'INVOICE',
  vendorName: 'Sunpeak Foods Co.',
  docNumber: 'SP-INV-1',
  date: '2026-03-01',
  lines: [
    {
      lineNo: 1,
      description: 'Honey, 12 oz',
      qty: 10,
      uom: 'CS',
      unitPrice: '5.00',
      lineTotal: '50.00',
    },
  ],
  subtotal: '50.00',
  shipping: '5.00',
  total: '55.00',
  ...over,
});

describe('math checks after a correction (M5 AC-2)', () => {
  it('passes a document that adds up', () => {
    expect(checkDocument(doc())).toEqual([]);
  });
  it('explains each sum that is off', () => {
    const out = checkDocument(
      doc({
        lines: [
          {
            lineNo: 1,
            description: 'Honey',
            qty: 12,
            uom: 'CS',
            unitPrice: '5.00',
            lineTotal: '50.00',
          },
        ],
        total: '60.00',
      }),
    );
    expect(out).toEqual([
      'line 1: 12 × 5.00 = 60.00, but the line total is 50.00',
      'subtotal + tax + shipping = 55.00, but the total is 60.00',
    ]);
  });
});
