import { Decimal, type ExtractedDocument } from '@reconcile/core';
import { toCentsString } from './normalize.ts';

const LINE_TOLERANCE = new Decimal('0.01');
const SUM_TOLERANCE = new Decimal('0.02');

/**
 * The math checks on an already-clean document (used after a human correction, M5 AC-2):
 * qty × unit price ≈ line total, lines ≈ subtotal, subtotal + tax + shipping ≈ total.
 * Returns plain-English problems; empty when everything adds up.
 */
export function checkDocument(doc: ExtractedDocument): string[] {
  const out: string[] = [];
  for (const l of doc.lines) {
    if (!l.unitPrice || !l.lineTotal) continue;
    const expected = new Decimal(l.unitPrice).times(l.qty);
    if (expected.minus(l.lineTotal).abs().greaterThan(LINE_TOLERANCE))
      out.push(
        `line ${l.lineNo}: ${l.qty} × ${l.unitPrice} = ${toCentsString(expected)}, but the line total is ${l.lineTotal}`,
      );
  }
  if (doc.subtotal && doc.lines.every((l) => l.lineTotal)) {
    const sum = doc.lines.reduce((s, l) => s.plus(l.lineTotal!), new Decimal(0));
    if (sum.minus(doc.subtotal).abs().greaterThan(SUM_TOLERANCE))
      out.push(`line totals add up to ${toCentsString(sum)}, but the subtotal is ${doc.subtotal}`);
  }
  if (doc.subtotal && doc.total) {
    const expected = new Decimal(doc.subtotal).plus(doc.tax ?? 0).plus(doc.shipping ?? 0);
    if (expected.minus(doc.total).abs().greaterThan(SUM_TOLERANCE))
      out.push(
        `subtotal + tax + shipping = ${toCentsString(expected)}, but the total is ${doc.total}`,
      );
  }
  return out;
}
