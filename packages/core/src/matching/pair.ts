import type { ExtractedDocument, ExtractedLine } from '../schemas/extracted.ts';
import { normalizeSku } from './normalize.ts';
import type { FuzzyMatcher } from './types.ts';

export interface PairLink {
  po?: ExtractedLine;
  rr?: ExtractedLine;
  inv?: ExtractedLine;
  method: 'SKU' | 'FUZZY';
  confidence?: number;
  reason?: string;
}

interface SidePair {
  other: ExtractedLine;
  fuzzy?: { score: number; reason: string };
}

/** Pair PO lines with lines on another document: exact SKU first, then fuzzy (M2 AC-3). */
function pairWith(
  poLines: readonly ExtractedLine[],
  otherLines: readonly ExtractedLine[],
  fuzzy: FuzzyMatcher,
  threshold: number,
): Map<number, SidePair> {
  const result = new Map<number, SidePair>();
  const used = new Set<number>();

  for (const p of poLines) {
    if (!p.sku) continue;
    const key = normalizeSku(p.sku);
    const hit = otherLines.find((o) => !used.has(o.lineNo) && o.sku && normalizeSku(o.sku) === key);
    if (hit) {
      result.set(p.lineNo, { other: hit });
      used.add(hit.lineNo);
    }
  }

  const leftPo = poLines.filter((p) => !result.has(p.lineNo));
  const leftOther = otherLines.filter((o) => !used.has(o.lineNo));
  if (leftPo.length === 0 || leftOther.length === 0) return result;

  // Two lines that both carry SKUs and still didn't match are different products.
  const skuConflict = (a: ExtractedLine, b: ExtractedLine) =>
    Boolean(a.sku && b.sku && normalizeSku(a.sku) !== normalizeSku(b.sku));
  const candidates = fuzzy(leftPo, leftOther)
    .filter((c) => c.score >= threshold)
    .filter((c) => {
      const a = leftPo.find((l) => l.lineNo === c.left);
      const b = leftOther.find((l) => l.lineNo === c.right);
      return a && b && !skuConflict(a, b);
    })
    .sort((x, y) => y.score - x.score || x.left - y.left || x.right - y.right);
  for (const c of candidates) {
    if (result.has(c.left) || used.has(c.right)) continue;
    const other = leftOther.find((l) => l.lineNo === c.right)!;
    result.set(c.left, { other, fuzzy: { score: c.score, reason: c.reason } });
    used.add(c.right);
  }
  return result;
}

/** Link the lines of a PO, its RR, and its primary invoice. Unpaired lines become one-sided links. */
export function pairLines(
  po: ExtractedDocument,
  rr: ExtractedDocument | undefined,
  inv: ExtractedDocument | undefined,
  fuzzy: FuzzyMatcher,
  threshold: number,
): PairLink[] {
  const toRr = rr ? pairWith(po.lines, rr.lines, fuzzy, threshold) : new Map<number, SidePair>();
  const toInv = inv ? pairWith(po.lines, inv.lines, fuzzy, threshold) : new Map<number, SidePair>();
  const links: PairLink[] = [];

  for (const p of po.lines) {
    const r = toRr.get(p.lineNo);
    const i = toInv.get(p.lineNo);
    const fuzzies = [r?.fuzzy, i?.fuzzy].filter((f) => f !== undefined);
    links.push({
      po: p,
      ...(r ? { rr: r.other } : {}),
      ...(i ? { inv: i.other } : {}),
      method: fuzzies.length ? 'FUZZY' : 'SKU',
      ...(fuzzies.length
        ? {
            confidence: Math.min(...fuzzies.map((f) => f.score)),
            reason: fuzzies.map((f) => f.reason).join(' | '),
          }
        : {}),
    });
  }
  const usedRr = new Set([...toRr.values()].map((s) => s.other.lineNo));
  const usedInv = new Set([...toInv.values()].map((s) => s.other.lineNo));
  for (const l of rr?.lines ?? []) if (!usedRr.has(l.lineNo)) links.push({ rr: l, method: 'SKU' });
  for (const l of inv?.lines ?? [])
    if (!usedInv.has(l.lineNo)) links.push({ inv: l, method: 'SKU' });
  return links;
}
