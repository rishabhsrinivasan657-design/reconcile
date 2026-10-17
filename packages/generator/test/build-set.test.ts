import {
  Decimal,
  PlantedErrorType,
  toCents,
  type PlantedErrorType as Planted,
} from '@reconcile/core';
import { describe, expect, it } from 'vitest';
import { buildSet, vendorProductName, vendorWordOrder } from '../src/build-set.ts';
import { Rng } from '../src/rng.ts';
import { buildCatalog } from '../src/catalog/index.ts';
import { resolveRates } from '../src/config.ts';
import { expectedExceptions } from '../src/truth.ts';

const catalog = buildCatalog();
const zeroErrors = Object.fromEntries(PlantedErrorType.options.map((t) => [t, 0]));
const only = (type: Planted) =>
  resolveRates({ cleanSetRate: 0, errors: { ...zeroErrors, [type]: 1 } });
const sets = (rates = resolveRates(), n = 100, seed = 42) =>
  Array.from({ length: n }, (_, i) => buildSet(catalog, rates, seed, i));

/** Which exception each planted error must produce (design §6.5). */
const EXPECTED: Partial<Record<Planted, string>> = {
  short_ship_billed_full: 'SHORT_SHIP',
  short_ship_billed_correctly: 'SHORT_SHIP',
  over_ship: 'OVER_SHIP',
  billed_not_received: 'QTY_BILLED_NOT_RECEIVED',
  price_change: 'PRICE_VARIANCE',
  extra_invoice_line: 'UNMATCHED_LINE',
  missing_document: 'MISSING_DOCUMENT',
  duplicate_invoice: 'DUPLICATE_INVOICE',
};

describe('planted errors (M1 AC-12)', () => {
  it.each(PlantedErrorType.options)('rate 1.0 for %s alone plants it in every set', (type) => {
    for (const set of sets(only(type), 30)) {
      expect(set.planted.map((p) => p.type)).toContain(type);
    }
  });

  it('all rates 0 produce fully clean sets with no exceptions', () => {
    const rates = resolveRates({ cleanSetRate: 0, errors: zeroErrors });
    for (const set of sets(rates, 30)) {
      expect(set.planted).toEqual([]);
      expect(expectedExceptions(set)).toEqual([]);
    }
  });

  it('every planted error produces its expected exception on the same lines', () => {
    for (const set of sets()) {
      const exceptions = expectedExceptions(set);
      for (const p of set.planted) {
        const type = EXPECTED[p.type];
        if (!type) continue; // typos and missing SKUs must still match cleanly: no exception
        const hit = exceptions.find(
          (e) => e.type === type && p.lineKeys.every((k) => e.lineKeys.includes(k)),
        );
        expect(hit, `${set.setId} ${p.type}`).toBeDefined();
      }
    }
  });

  it('clean sets and description/SKU noise raise no exceptions', () => {
    for (const set of sets()) {
      const noisy = set.planted.every((p) => !EXPECTED[p.type]);
      if (noisy) expect(expectedExceptions(set), set.setId).toEqual([]);
    }
  });

  it('about 30% of sets are clean by default', () => {
    const clean = sets().filter((s) => s.planted.length === 0).length;
    expect(clean).toBeGreaterThanOrEqual(18);
    expect(clean).toBeLessThanOrEqual(42);
  });
});

describe('reworded SKU-less lines (M3 AC-16, B-16)', () => {
  it('rewords about 60% of SKU-less lines, sometimes the whole invoice; still no exception', () => {
    const all = sets(only('sku_omitted'), 80).map((set) => ({ set, p: set.planted[0]! }));
    const lines = all.reduce((n, { p }) => n + Number(p.details.linesWithoutSku), 0);
    const reworded = all.reduce((n, { p }) => n + Number(p.details.reworded), 0);
    expect(reworded / lines).toBeGreaterThanOrEqual(0.45);
    expect(reworded / lines).toBeLessThanOrEqual(0.75);
    expect(all.some(({ p }) => Number(p.details.linesWithoutSku) > 1)).toBe(true);
    for (const { set } of all) {
      const inv = set.docs.find((d) => d.role === 'inv-1')!;
      expect(inv.lines.some((l) => l.sku === undefined)).toBe(true);
      expect(expectedExceptions(set)).toEqual([]);
    }
  });

  it('vendor word order moves the first word after the brand to the end', () => {
    expect(vendorWordOrder('Sunpeak Crunchy Almond Butter, 12 oz', 'Sunpeak')).toBe(
      'Sunpeak Almond Butter Crunchy, 12 oz',
    );
    expect(vendorWordOrder('Harvest Mill Honey Almond Granola, 12 oz', 'Harvest Mill')).toBe(
      'Harvest Mill Almond Granola Honey, 12 oz',
    );
  });
});

describe("vendor's own product names (M4 AC-15)", () => {
  it('renames the product, keeps the variant meaning and size, drops brand and SKU', () => {
    expect(vendorProductName(new Rng(1), 'Sunpeak Crunchy Almond Butter, 12 oz', 'SNPK')).toMatch(
      /^Chunky (Nut Spread, Almond|Almond Nut Paste), 12 oz$/,
    );
    for (const set of sets(only('vendor_name'), 40)) {
      const p = set.planted.find((x) => x.type === 'vendor_name')!;
      if (!p.details.vendorName) continue;
      const inv = set.docs.find((d) => d.role === 'inv-1')!;
      const line = inv.lines.find((l) => l.description === p.details.vendorName)!;
      expect(line.sku).toBeUndefined();
      expect(String(p.details.vendorName).split(', ').at(-1)).toBe(
        String(p.details.original).split(', ').at(-1),
      );
      expect(expectedExceptions(set)).toEqual([]);
    }
  });

  it('every catalog product has vendor names', async () => {
    const { VENDORS, VENDOR_PRODUCT_NAMES } = await import('../src/catalog/data.ts');
    for (const v of VENDORS)
      for (const p of v.products) expect(VENDOR_PRODUCT_NAMES[p.name], p.name).toBeDefined();
  });
});

describe('price noise (M2 AC-16)', () => {
  it('is always 1 cent or more, and inside max($0.01, 0.5%)', () => {
    for (const set of sets(only('price_noise'), 60)) {
      const p = set.planted.find((x) => x.type === 'price_noise')!;
      const po = new Decimal(p.details.poPrice as string);
      const diff = new Decimal(p.details.invoicePrice as string).minus(po).abs();
      expect(diff.greaterThanOrEqualTo('0.01')).toBe(true);
      expect(diff.lessThanOrEqualTo(Decimal.max('0.01', po.times('0.005')))).toBe(true);
      expect(expectedExceptions(set)).toEqual([]);
    }
  });
});

describe('document arithmetic (M1 AC-14)', () => {
  it('qty x price = line total, lines sum to subtotal, totals add up', () => {
    for (const set of sets()) {
      for (const doc of set.docs) {
        if (doc.type === 'RR') {
          expect(
            doc.lines.every((l) => l.unitPrice === undefined && l.lineTotal === undefined),
          ).toBe(true);
          continue;
        }
        let sum = new Decimal(0);
        for (const l of doc.lines) {
          expect(l.lineTotal).toBe(toCents(new Decimal(l.unitPrice!).times(l.qty)));
          sum = sum.plus(l.lineTotal!);
        }
        expect(doc.subtotal).toBe(toCents(sum));
        const total = new Decimal(doc.subtotal!).plus(doc.tax ?? 0).plus(doc.shipping ?? 0);
        expect(doc.total).toBe(toCents(total));
      }
    }
  });
});

describe('determinism', () => {
  it('same seed and index give the same set; sets are independent of count', () => {
    const a = buildSet(catalog, resolveRates(), 42, 17);
    const b = sets(resolveRates(), 20)[17];
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(buildSet(catalog, resolveRates(), 7, 17))).not.toBe(JSON.stringify(a));
  });
});
