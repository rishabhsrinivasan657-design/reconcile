import type { ExtractedDocument } from '../schemas/extracted.ts';
import { normalizePo, normalizeVendor } from './normalize.ts';

export interface DocGroup {
  poNumber: string;
  docs: ExtractedDocument[];
  /** Plain-English notes about assumptions made while grouping (shown to the clerk). */
  notes: string[];
}

/** True when a and b differ by at most one inserted, deleted, or changed character. */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const DOC_NAME: Record<ExtractedDocument['type'], string> = {
  PO: 'purchase order',
  RR: 'receiving report',
  INVOICE: 'invoice',
};

/**
 * M4 AC-14 (backlog B-17): a misread PO number splits one set into two groups. If a group with no
 * purchase order points to a number one character away from a group that has the purchase order
 * (same vendor, and that group is missing what the other has), merge them and say so.
 */
function mergeNearMisses(groups: DocGroup[]): DocGroup[] {
  const vendorOf = (g: DocGroup) => normalizeVendor(g.docs[0]?.vendorName ?? '');
  const result = [...groups];
  for (const orphan of groups) {
    if (orphan.docs.some((d) => d.type === 'PO')) continue;
    const target = result.find(
      (g) =>
        g !== orphan &&
        g.docs.some((d) => d.type === 'PO') &&
        withinOneEdit(g.poNumber, orphan.poNumber) &&
        vendorOf(g) === vendorOf(orphan) &&
        orphan.docs.every((d) => !g.docs.some((x) => x.type === d.type)),
    );
    if (!target) continue;
    const keepOrphanNumber = orphan.docs.length > target.docs.length;
    const poSays = target.poNumber;
    const othersSay = orphan.poNumber;
    const others = [...new Set(orphan.docs.map((d) => DOC_NAME[d.type]))].join(' and ');
    target.docs.push(...orphan.docs);
    target.notes.push(
      `The purchase order says ${poSays} but the ${others} say${orphan.docs.length === 1 ? 's' : ''} ${othersSay} ` +
        '(1 character apart, same vendor). Grouped together: please confirm the PO number.',
    );
    if (keepOrphanNumber) target.poNumber = othersSay;
    result.splice(result.indexOf(orphan), 1);
  }
  return result;
}

/**
 * Group documents by PO number (M2 AC-2): a PO by its own number, an RR or invoice by its PO
 * reference. A group may lack its PO, RR, or invoice; that's how missing documents are found.
 */
export function groupByPo(docs: readonly ExtractedDocument[]): {
  groups: DocGroup[];
  unassigned: string[];
} {
  const byKey = new Map<string, DocGroup>();
  const unassigned: string[] = [];
  for (const doc of docs) {
    const raw = doc.type === 'PO' ? doc.docNumber : doc.poNumber;
    if (!raw) {
      unassigned.push(doc.id);
      continue;
    }
    const key = normalizePo(raw);
    const group = byKey.get(key) ?? { poNumber: key, docs: [], notes: [] };
    group.docs.push(doc);
    byKey.set(key, group);
  }
  const groups = mergeNearMisses([...byKey.values()]).sort((a, b) =>
    a.poNumber.localeCompare(b.poNumber),
  );
  for (const g of groups) g.docs.sort((a, b) => a.id.localeCompare(b.id));
  return { groups, unassigned };
}
