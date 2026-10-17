import type { ExtractedDocument, ExtractedLine } from '../schemas/extracted.ts';

/** Build small documents for matcher tests. Lines: [sku, description, qty, unitPrice?]. */
export function doc(
  id: string,
  type: ExtractedDocument['type'],
  lines: [sku: string | undefined, description: string, qty: number, price?: string][],
  extra: Partial<ExtractedDocument> = {},
): ExtractedDocument {
  const built: ExtractedLine[] = lines.map(([sku, description, qty, price], i) => ({
    lineNo: i + 1,
    ...(sku ? { sku } : {}),
    description,
    qty,
    uom: 'CS',
    ...(price ? { unitPrice: price } : {}),
  }));
  return {
    id,
    type,
    vendorName: 'Sunpeak Foods Co.',
    docNumber: type === 'PO' ? 'HP-PO-1' : `${type}-${id}`,
    ...(type === 'PO' ? {} : { poNumber: 'HP-PO-1' }),
    date: '2026-03-01',
    lines: built,
    ...extra,
  };
}
