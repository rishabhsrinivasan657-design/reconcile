import type { ExtractedDocument } from '../schemas/extracted.ts';
import { daysBetween, normalizeDocNumber, normalizeVendor } from './normalize.ts';

/**
 * Split invoices into originals and duplicates (M2 AC-6). An invoice is a duplicate of an
 * earlier one from the same vendor if it has the same invoice number, or the same total
 * within `windowDays`. Earliest date wins (ties broken by id). Works across groups too.
 */
export function findDuplicates(
  invoices: readonly ExtractedDocument[],
  windowDays: number,
): Map<string, ExtractedDocument> {
  const sorted = [...invoices].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );
  const originals: ExtractedDocument[] = [];
  const duplicateOf = new Map<string, ExtractedDocument>();
  for (const inv of sorted) {
    const vendor = normalizeVendor(inv.vendorName);
    const original = originals.find(
      (o) =>
        normalizeVendor(o.vendorName) === vendor &&
        (normalizeDocNumber(o.docNumber) === normalizeDocNumber(inv.docNumber) ||
          (o.total !== undefined &&
            o.total === inv.total &&
            daysBetween(o.date, inv.date) <= windowDays)),
    );
    if (original) duplicateOf.set(inv.id, original);
    else originals.push(inv);
  }
  return duplicateOf;
}
