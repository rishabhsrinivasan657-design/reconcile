import { describe, expect, it } from 'vitest';
import { matchDocuments } from './index.ts';
import { normalizeSku } from './normalize.ts';
import { doc } from './test-helpers.ts';

const AB = 'Sunpeak Crunchy Almond Butter, 12 oz';
const PB = 'Sunpeak Creamy Peanut Butter, 16 oz';

/** One PO line, its RR line, and its invoice line, with the quantities and prices given. */
async function oneLine(o: number, r: number, b: number, pPo = '5.00', pInv = pPo) {
  const result = await matchDocuments([
    doc('po', 'PO', [['SP-1', AB, o, pPo]]),
    doc('rr', 'RR', [['SP-1', AB, r]]),
    doc('inv', 'INVOICE', [['SP-1', AB, b, pInv]], { docNumber: 'INV-1', total: '1.00' }),
  ]);
  return result.groups[0]!.exceptions.map(({ type, amount, informational }) => ({
    type,
    amount,
    informational,
  }));
}

describe('FR-09 exceptions, count each billed unit once (AC-4)', () => {
  it('clean line raises nothing', async () => expect(await oneLine(10, 10, 10)).toEqual([]));

  it('short-ship billed in full carries the over-billing', async () =>
    expect(await oneLine(10, 8, 10)).toEqual([
      { type: 'SHORT_SHIP', amount: '10.00', informational: false },
    ]));

  it('short-ship billed correctly is informational', async () =>
    expect(await oneLine(10, 8, 8)).toEqual([
      { type: 'SHORT_SHIP', amount: '0.00', informational: true },
    ]));

  it('over-ship billed for everything received', async () =>
    expect(await oneLine(10, 12, 12)).toEqual([
      { type: 'OVER_SHIP', amount: '10.00', informational: false },
    ]));

  it('over-ship billed only for what was ordered is informational', async () =>
    expect(await oneLine(10, 12, 10)).toEqual([
      { type: 'OVER_SHIP', amount: '0.00', informational: true },
    ]));

  it('billed but not received', async () =>
    expect(await oneLine(10, 10, 13)).toEqual([
      { type: 'QTY_BILLED_NOT_RECEIVED', amount: '15.00', informational: false },
    ]));

  it('over-ship plus billed beyond received: two non-overlapping amounts', async () =>
    expect(await oneLine(10, 12, 15)).toEqual([
      { type: 'OVER_SHIP', amount: '10.00', informational: false },
      { type: 'QTY_BILLED_NOT_RECEIVED', amount: '15.00', informational: false },
    ]));

  it('worked example: $10.00 short-ship + $1.60 price variance = $11.60', async () =>
    expect(await oneLine(10, 8, 10, '4.80', '5.00')).toEqual([
      { type: 'SHORT_SHIP', amount: '10.00', informational: false },
      { type: 'PRICE_VARIANCE', amount: '1.60', informational: false },
    ]));

  it('undercharge is a negative price variance', async () =>
    expect(await oneLine(10, 10, 10, '5.00', '4.50')).toEqual([
      { type: 'PRICE_VARIANCE', amount: '-5.00', informational: false },
    ]));
});

describe('tolerances (AC-5)', () => {
  it('a price exactly at tolerance raises nothing; 1 cent beyond does', async () => {
    // $30.00 x 0.5% = $0.15 tolerance
    expect(await oneLine(10, 10, 10, '30.00', '30.15')).toEqual([]);
    expect(await oneLine(10, 10, 10, '30.00', '30.16')).toEqual([
      { type: 'PRICE_VARIANCE', amount: '1.60', informational: false },
    ]);
    // cheap item: the $0.01 floor applies
    expect(await oneLine(10, 10, 10, '1.00', '1.01')).toEqual([]);
  });

  it('a configured quantity tolerance absorbs small differences', async () => {
    const docs = [
      doc('po', 'PO', [['SP-1', AB, 100, '5.00']]),
      doc('rr', 'RR', [['SP-1', AB, 99]]),
      doc('inv', 'INVOICE', [['SP-1', AB, 100, '5.00']], { total: '500.00' }),
    ];
    expect((await matchDocuments(docs)).groups[0]!.exceptions).toHaveLength(1);
    expect(
      (await matchDocuments(docs, { config: { qtyTolerance: { abs: 1, pct: 0 } } })).groups[0]!
        .exceptions,
    ).toEqual([]);
  });
});

describe('grouping and missing documents (AC-2)', () => {
  it('regroups a mixed pile by PO number', async () => {
    const set = (n: number) => [
      doc(`po${n}`, 'PO', [['SP-1', AB, 5, '5.00']], { docNumber: `HP-PO-${n}` }),
      doc(`rr${n}`, 'RR', [['SP-1', AB, 5]], { poNumber: ` hp-po-${n} ` }),
      doc(`inv${n}`, 'INVOICE', [['SP-1', AB, 5, '5.00']], {
        poNumber: `HP-PO-${n}`,
        docNumber: `INV-${n}`,
        total: `${n}.00`,
      }),
    ];
    const result = await matchDocuments([...set(2), ...set(1), ...set(3)].reverse());
    expect(result.groups.map((g) => g.documents.map((d) => d.id).sort())).toEqual([
      ['inv1', 'po1', 'rr1'],
      ['inv2', 'po2', 'rr2'],
      ['inv3', 'po3', 'rr3'],
    ]);
  });

  it('an RR and invoice without a PO report only MISSING_DOCUMENT with the invoice at risk', async () => {
    const result = await matchDocuments([
      doc('rr', 'RR', [['SP-1', AB, 5]]),
      doc('inv', 'INVOICE', [['SP-1', AB, 9, '5.00']], { total: '45.00' }),
    ]);
    expect(result.groups[0]!.exceptions).toMatchObject([
      { type: 'MISSING_DOCUMENT', missing: 'po', amount: '45.00', informational: false },
    ]);
  });

  it('a missing invoice is informational', async () => {
    const result = await matchDocuments([
      doc('po', 'PO', [['SP-1', AB, 5, '5.00']]),
      doc('rr', 'RR', [['SP-1', AB, 5]]),
    ]);
    expect(result.groups[0]!.exceptions).toMatchObject([
      { type: 'MISSING_DOCUMENT', missing: 'invoice', amount: '0.00', informational: true },
    ]);
  });

  it('documents with no PO number are unassigned', async () => {
    const noRef = doc('inv', 'INVOICE', [['SP-1', AB, 5, '5.00']]);
    delete noRef.poNumber;
    expect((await matchDocuments([noRef])).unassigned).toEqual(['inv']);
  });
});

describe('duplicates (AC-6)', () => {
  const base = () => [
    doc('po', 'PO', [['SP-1', AB, 5, '5.00']]),
    doc('rr', 'RR', [['SP-1', AB, 5]]),
  ];
  const inv = (id: string, extra: object) =>
    doc(id, 'INVOICE', [['SP-1', AB, 5, '5.00']], { total: '25.00', docNumber: 'INV-7', ...extra });

  it('same vendor and invoice number: the later one is a duplicate and is not matched', async () => {
    const g = (await matchDocuments([...base(), inv('a', {}), inv('b', { date: '2026-03-20' })]))
      .groups[0]!;
    expect(g.documents.find((d) => d.id === 'b')!.role).toBe('duplicate');
    expect(g.exceptions).toMatchObject([
      { type: 'DUPLICATE_INVOICE', documentIds: ['a', 'b'], amount: '25.00' },
    ]);
    expect(g.lineMatches.every((m) => m.inv?.docId !== 'b')).toBe(true);
  });

  it('same vendor and total within the window, even with a new number', async () => {
    const g = (
      await matchDocuments([
        ...base(),
        inv('a', {}),
        inv('b', { docNumber: 'INV-8', date: '2026-04-10' }),
      ])
    ).groups[0]!;
    expect(g.exceptions.map((e) => e.type)).toEqual(['DUPLICATE_INVOICE']);
  });

  it('same total outside the window is not a duplicate', async () => {
    const g = (
      await matchDocuments([
        ...base(),
        inv('a', {}),
        inv('b', { docNumber: 'INV-8', date: '2026-06-30' }),
      ])
    ).groups[0]!;
    expect(g.exceptions.map((e) => e.type)).not.toContain('DUPLICATE_INVOICE');
  });
});

describe('line pairing (AC-3)', () => {
  it('normalizes SKUs', async () => {
    expect(normalizeSku('sp-0123')).toBe(normalizeSku('SP 123'));
    expect(normalizeSku('SP.0123')).toBe('SP123');
    expect(normalizeSku('10442-12')).toBe('1044212');
  });

  it('pairs a SKU-less invoice line by description, with a reason', async () => {
    const g = (
      await matchDocuments([
        doc('po', 'PO', [
          ['SP-1', AB, 5, '5.00'],
          ['SP-2', PB, 3, '4.00'],
        ]),
        doc('rr', 'RR', [
          ['SP-2', PB, 3],
          ['SP-1', AB, 5],
        ]),
        doc(
          'inv',
          'INVOICE',
          [
            [undefined, 'Sunpeak Crnchy Almnd Btr, 12OZ', 5, '5.00'],
            ['SP-2', PB, 3, '4.00'],
          ],
          { total: '37.00' },
        ),
      ])
    ).groups[0]!;
    const fuzzy = g.lineMatches.find((m) => m.method === 'FUZZY')!;
    expect(fuzzy).toMatchObject({ po: { lineNo: 1 }, rr: { lineNo: 2 }, inv: { lineNo: 1 } });
    expect(fuzzy.confidence).toBeGreaterThan(0.75);
    expect(fuzzy.reason).toMatch(/btr.*butter|sizes match/);
    expect(g.exceptions).toEqual([]);
  });

  it('does not pair different sizes or conflicting SKUs; leftovers become UNMATCHED_LINE', async () => {
    const g = (
      await matchDocuments([
        doc('po', 'PO', [['SP-1', AB, 5, '5.00']]),
        doc('rr', 'RR', [['SP-1', AB, 5]]),
        doc(
          'inv',
          'INVOICE',
          [
            ['SP-1', AB, 5, '5.00'],
            ['SP-9', 'Sunpeak Crunchy Almond Butter, 16 oz', 2, '6.00'],
          ],
          { total: '37.00' },
        ),
      ])
    ).groups[0]!;
    expect(g.exceptions).toMatchObject([
      {
        type: 'UNMATCHED_LINE',
        amount: '12.00',
        informational: false,
        lines: [{ docId: 'inv', lineNo: 2 }],
      },
    ]);
  });
});

describe('explanations and purity (AC-7, AC-8)', () => {
  it('explanations quote the same dollar amount as the exception', async () => {
    const g = (
      await matchDocuments([
        doc('po', 'PO', [['SP-1', AB, 48, '232.97']]),
        doc('rr', 'RR', [['SP-1', AB, 38]]),
        doc('inv', 'INVOICE', [['SP-1', AB, 48, '232.97']], { total: '1.00' }),
      ])
    ).groups[0]!;
    expect(g.exceptions[0]!.explanation).toBe(
      'Ordered 48, received 38, billed 48 at $232.97: billed for 10 units that never arrived ($2,329.70).',
    );
  });

  it('is deterministic', async () => {
    const docs = [
      doc('po', 'PO', [['SP-1', AB, 5, '5.00']]),
      doc('rr', 'RR', [['SP-1', AB, 4]]),
      doc('inv', 'INVOICE', [['SP-1', AB, 5, '5.00']]),
    ];
    expect(JSON.stringify(await matchDocuments(docs))).toBe(
      JSON.stringify(await matchDocuments(docs)),
    );
  });
});

describe('misread PO numbers (M4 AC-14, B-17)', () => {
  const po = (num: string, vendor = 'Sunpeak Foods Co.') =>
    doc('po', 'PO', [['SP-1', AB, 5, '5.00']], { docNumber: num, vendorName: vendor });
  const rr = (num: string) => doc('rr', 'RR', [['SP-1', AB, 5]], { poNumber: num });
  const inv = (num: string) =>
    doc('inv', 'INVOICE', [['SP-1', AB, 5, '5.00']], { poNumber: num, total: '25.00' });

  it('groups a PO one character away from its RR and invoice, with a note', async () => {
    const r = await matchDocuments([po('HP-PO-10793'), rr('HP-PO-107093'), inv('HP-PO-107093')]);
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]!.poNumber).toBe('HP-PO-107093');
    expect(r.groups[0]!.notes[0]).toMatch(/purchase order says HP-PO-10793 .* say HP-PO-107093/);
    expect(r.groups[0]!.exceptions.map((e) => e.type)).not.toContain('MISSING_DOCUMENT');
  });

  it('does not merge different vendors or numbers two characters apart', async () => {
    const otherVendor = await matchDocuments([
      po('HP-PO-10793', 'Bluewater Seafood Co.'),
      rr('HP-PO-107093'),
      inv('HP-PO-107093'),
    ]);
    expect(otherVendor.groups).toHaveLength(2);
    const twoApart = await matchDocuments([
      po('HP-PO-1079'),
      rr('HP-PO-107093'),
      inv('HP-PO-107093'),
    ]);
    expect(twoApart.groups).toHaveLength(2);
  });

  it('withinOneEdit handles change, insert, and delete', async () => {
    const { withinOneEdit } = await import('./group.ts');
    expect(withinOneEdit('107093', '10793')).toBe(true);
    expect(withinOneEdit('107093', '107083')).toBe(true);
    expect(withinOneEdit('107093', '1070933')).toBe(true);
    expect(withinOneEdit('107093', '170093')).toBe(false);
  });
});
