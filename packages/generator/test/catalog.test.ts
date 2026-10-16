import { describe, expect, it } from 'vitest';
import { buildCatalog, TEMPLATE_FAMILIES } from '../src/catalog/index.ts';

describe('catalog (M1 AC-10, AC-11)', () => {
  const catalog = buildCatalog();

  it('has 15 vendors and ~200 SKUs', () => {
    expect(catalog.vendors).toHaveLength(15);
    expect(catalog.items.length).toBeGreaterThanOrEqual(190);
    expect(catalog.items.length).toBeLessThanOrEqual(210);
  });

  it('has unique (vendor, sku) pairs and unique descriptions per vendor', () => {
    const keys = catalog.items.map((i) => `${i.vendorCode}|${i.sku}`);
    expect(new Set(keys).size).toBe(keys.length);
    const descs = catalog.items.map((i) => `${i.vendorCode}|${i.description}`);
    expect(new Set(descs).size).toBe(descs.length);
  });

  it('has positive 2-decimal prices', () => {
    for (const item of catalog.items) {
      expect(item.unitPrice).toMatch(/^\d+\.\d{2}$/);
      expect(Number(item.unitPrice)).toBeGreaterThan(0);
    }
  });

  it('is identical for the same seed and different for another', () => {
    expect(JSON.stringify(buildCatalog(42))).toBe(JSON.stringify(catalog));
    expect(JSON.stringify(buildCatalog(7))).not.toBe(JSON.stringify(catalog));
  });

  it('uses all 6 template families across vendors with varied styles', () => {
    const families = new Set(catalog.vendors.map((v) => v.style.family));
    expect(families).toEqual(new Set(TEMPLATE_FAMILIES));
    expect(new Set(catalog.vendors.map((v) => v.style.font)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(catalog.vendors.map((v) => v.style.dateFormat)).size).toBe(4);
    expect(new Set(catalog.vendors.map((v) => v.style.columns.join())).size).toBe(3);
    expect(new Set(catalog.vendors.map((v) => v.style.labels.qty)).size).toBeGreaterThanOrEqual(3);
  });
});
