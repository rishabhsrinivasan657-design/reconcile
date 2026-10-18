import { describe, expect, it } from 'vitest';
import { boxStyle, fieldRows } from '../src/lib/fields';

describe('document fields and highlight boxes (M5 AC-4)', () => {
  const rows = fieldRows(
    {
      vendorName: 'Sunpeak Foods Co.',
      docNumber: 'SP-INV-1',
      date: '2026-03-12',
      lines: [{ lineNo: 1, description: 'Honey, 12 oz', qty: 10, uom: 'CS', unitPrice: '5.00' }],
      total: '50.00',
    },
    { vendorName: 0.98, date: 0.62, 'lines.0.qty': 0.95, total: 0.97 },
    {
      vendorName: { page: 1, bbox: [0.1, 0.05, 0.4, 0.08] },
      total: { page: 2, bbox: [0.8, 0.9, 0.95, 0.92] },
    },
  );
  it('lists header fields, then each line, then totals, with friendly labels', () => {
    expect(rows.map((r) => r.key)).toEqual([
      'vendorName',
      'docNumber',
      'date',
      'lines.0.description',
      'lines.0.qty',
      'lines.0.uom',
      'lines.0.unitPrice',
      'total',
    ]);
    expect(rows.find((r) => r.key === 'lines.0.qty')!.label).toBe('Line 1 · qty');
  });
  it('marks fields below 80% confidence as unsure', () => {
    expect(rows.filter((r) => r.unsure).map((r) => r.key)).toEqual(['date']);
  });
  it('keeps each box and its page; fields without one still show', () => {
    expect(rows.find((r) => r.key === 'total')).toMatchObject({
      page: 2,
      box: [0.8, 0.9, 0.95, 0.92],
    });
    expect(rows.find((r) => r.key === 'docNumber')!.box).toBeNull();
  });
  it('places a padded box in percentages of the page, never outside it', () => {
    expect(boxStyle([0.1, 0.2, 0.3, 0.25], 0)).toEqual({
      left: '10.00%',
      top: '20.00%',
      width: '20.00%',
      height: '5.00%',
    });
    const edge = boxStyle([0, 0, 1, 1]);
    expect(edge.left).toBe('0.00%');
    expect(edge.width).toBe('100.00%');
  });
});
