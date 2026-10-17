import type { ExtractedDocument } from '../schemas/extracted.ts';
import { normalizePo } from './normalize.ts';

export interface DocGroup {
  poNumber: string;
  docs: ExtractedDocument[];
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
    const group = byKey.get(key) ?? { poNumber: key, docs: [] };
    group.docs.push(doc);
    byKey.set(key, group);
  }
  const groups = [...byKey.values()].sort((a, b) => a.poNumber.localeCompare(b.poNumber));
  for (const g of groups) g.docs.sort((a, b) => a.id.localeCompare(b.id));
  return { groups, unassigned };
}
