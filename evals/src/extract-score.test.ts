import { fromTruthDocument } from '@reconcile/core';
import type { ExtractionResult } from '@reconcile/extraction';
import { describe, expect, it } from 'vitest';
import { scoreExtraction, type ExtractInput } from './extract-score.ts';
import { loadSubset, SUBSETS } from './load.ts';

const sets = loadSubset(SUBSETS.ci);

/** A "perfect reader": the answer key's values, all confident, nothing flagged. */
function perfect(): ExtractInput[] {
  return sets.flatMap((s) =>
    s.truth.documents.map((d) => {
      const docId = `${s.truth.setId}/${d.role}`;
      const result: ExtractionResult = {
        document: fromTruthDocument(d, docId),
        confidence: {},
        locations: {
          total: {
            page: d.fields.total?.page ?? 1,
            ...(d.fields.total ? { bbox: d.fields.total.bbox } : {}),
          },
        },
        needsReview: false,
        reviewReasons: [],
        pages: d.pages,
        llm: {
          usage: { inputTokens: 100, outputTokens: 50 },
          costUsd: 0.001,
          latencyMs: 1000,
          cacheHit: true,
          model: 'm',
          provider: 'p',
        },
      };
      return { docId, setId: s.truth.setId, truth: d, result };
    }),
  );
}
const docOf = (i: ExtractInput) => (i.result as ExtractionResult).document!;

describe('extraction scorer (M3 AC-10, AC-12, AC-13)', () => {
  it('a perfect reader scores 100 on every gated metric', () => {
    const r = scoreExtraction(perfect(), sets.length);
    for (const v of Object.values(r.scores)) expect(v).toBe(100);
    expect(r.errors).toEqual([]);
    expect(r.reported.costPerDocUsd).toBe(0.001);
  });

  it('one wrong unit price costs exactly one false positive and one false negative', () => {
    const inputs = perfect();
    const inv = inputs.find((i) => i.truth.type === 'INVOICE')!;
    docOf(inv).lines[0]!.unitPrice = '999.99';
    const r = scoreExtraction(inputs, sets.length);
    const row = r.perField.find((f) => f.field === 'lines.unitPrice')!;
    expect([row.fp, row.fn]).toEqual([1, 1]);
    expect(r.errors).toHaveLength(1);
    expect(r.scores.fieldF1).toBeLessThan(100);
  });

  it('"fixing" a printed typo counts as a reading error', () => {
    const inputs = perfect();
    const target =
      inputs.find((i) =>
        i.truth.fields.lines.some((l) => /Lvender|Btr|Crmy|Choc|Orig/.test(l.description.value)),
      ) ?? inputs.find((i) => i.truth.type === 'INVOICE')!;
    const doc = docOf(target);
    doc.lines[0]!.description = doc.lines[0]!.description.toUpperCase() + ' (corrected)';
    expect(scoreExtraction(inputs, sets.length).errors.map((e) => e.field)).toContain(
      'lines.description',
    );
  });

  it('an invented extra line counts against precision only', () => {
    const inputs = perfect();
    const doc = docOf(inputs[0]!);
    doc.lines.push({ lineNo: 99, description: 'Imaginary item', qty: 1, uom: 'CS' });
    const r = scoreExtraction(inputs, sets.length);
    expect(r.scores.fieldRecall).toBe(100);
    expect(r.scores.fieldPrecision).toBeLessThan(100);
  });

  it('catch rate = share of errors in documents flagged for review', () => {
    const inputs = perfect();
    const invoices = inputs.filter((i) => i.truth.type === 'INVOICE').slice(0, 2);
    docOf(invoices[0]!).total = '1.00';
    docOf(invoices[1]!).total = '2.00';
    (invoices[0]!.result as ExtractionResult).needsReview = true;
    const r = scoreExtraction(inputs, sets.length);
    expect(r.reported.catchRate).toBe(50);
    expect(r.errors.map((e) => e.flagged).sort()).toEqual([false, true]);
  });

  it('a document that failed to extract counts all its fields as missed', () => {
    const inputs = perfect();
    inputs[0]!.result = { error: 'boom' };
    const r = scoreExtraction(inputs, sets.length);
    expect(r.reported.failedDocuments).toBe(1);
    expect(r.scores.fieldRecall).toBeLessThan(100);
    expect(r.scores.fieldPrecision).toBe(100);
  });
});
