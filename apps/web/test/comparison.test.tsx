import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Comparison } from '../src/app/problems/Comparison';
import type { Line } from '../src/lib/api';

const line = (over: Partial<Line>): Line => ({
  docId: 'd',
  docNumber: 'X',
  lineNo: 3,
  sku: 'SP-ALB-12',
  description: 'Crunchy Almond Butter, 12 oz',
  qty: 120,
  uom: 'CS',
  unitPrice: '48.20',
  lineTotal: '5784.00',
  ...over,
});

describe('side-by-side lines (M5 AC-5)', () => {
  it('emphasizes the price that differs and writes the difference', () => {
    render(
      <Comparison
        rows={[
          {
            po: line({}),
            rr: line({ unitPrice: null, lineTotal: null }),
            invoice: line({ sku: null, unitPrice: '52.10', lineTotal: '6252.00', lineNo: 2 }),
            method: 'FUZZY_LLM',
            reason: 'AI: same product',
          },
        ]}
      />,
    );
    expect(screen.getByText('+$3.90 / cs vs the PO')).toBeTruthy();
    expect(screen.getByText('No SKU')).toBeTruthy();
  });
  it('shows a quantity gap and a missing side in words', () => {
    render(
      <Comparison
        rows={[{ po: line({}), rr: line({ qty: 114 }), invoice: null, method: null, reason: null }]}
      />,
    );
    expect(screen.getByText('−6 CS vs the PO')).toBeTruthy();
    expect(screen.getByText('Not billed')).toBeTruthy();
  });
});
