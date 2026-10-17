import { matchDocuments, type MatchResult } from '@reconcile/core';
import { describe, expect, it } from 'vitest';
import { compare, type Baseline } from './baseline.ts';
import { loadSubset, SUBSETS } from './load.ts';
import { score, type Scores } from './score.ts';

const sets = loadSubset(SUBSETS.ci);
const fresh = (): MatchResult => matchDocuments(sets.flatMap((s) => s.docs));

describe('scorer (M2 AC-11)', () => {
  it('a perfect prediction scores 100 everywhere', () => {
    const r = score(sets, fresh());
    for (const v of Object.values(r.scores)) expect(v).toBe(100);
    expect(r.mistakes).toEqual([]);
  });

  it('dropping one line match lowers link recall by exactly its pairs', () => {
    const result = fresh();
    const truePairs = score(sets, result).counts;
    const group = result.groups.find((g) => g.lineMatches.some((m) => m.po && m.rr && m.inv))!;
    const idx = group.lineMatches.findIndex((m) => m.po && m.rr && m.inv);
    group.lineMatches.splice(idx, 1); // a full PO-RR-invoice match = 3 pairs
    const r = score(sets, result);
    const totalPairs = sets.reduce(
      (n, s) =>
        n +
        s.truth.lineMatches.reduce((k, m) => {
          const sides = [m.po, m.rr, m.inv].filter(Boolean).length;
          return k + (sides * (sides - 1)) / 2;
        }, 0),
      0,
    );
    expect(r.scores.linkPrecision).toBe(100);
    expect(r.scores.linkRecall).toBeCloseTo((100 * (totalPairs - 3)) / totalPairs, 1);
    expect(r.mistakes.filter((m) => m.kind === 'missed_link')).toHaveLength(3);
    expect(truePairs.sets).toBe(20);
  });

  it('a wrong amount counts as detected but lowers amount accuracy', () => {
    const result = fresh();
    const e = result.groups.flatMap((g) => g.exceptions).find((x) => !x.informational)!;
    e.amount = '0.01';
    const r = score(sets, result);
    expect(r.scores.exceptionRecall).toBe(100);
    expect(r.scores.amountAccuracy).toBeLessThan(100);
    expect(r.mistakes.map((m) => m.kind)).toEqual(['wrong_amount']);
  });

  it('a missing and an invented exception lower recall and precision', () => {
    const result = fresh();
    const g = result.groups.find((x) => x.exceptions.length > 0)!;
    const [removed] = g.exceptions.splice(0, 1);
    g.exceptions.push({
      ...removed!,
      type: removed!.type === 'OVER_SHIP' ? 'SHORT_SHIP' : 'OVER_SHIP',
    });
    const r = score(sets, result);
    expect(r.scores.exceptionRecall).toBeLessThan(100);
    expect(r.scores.exceptionPrecision).toBeLessThan(100);
    expect(r.mistakes.map((m) => m.kind).sort()).toEqual(['false_negative', 'false_positive']);
  });
});

describe('baseline gate (M2 AC-12)', () => {
  const metrics: Scores = {
    groupingAccuracy: 100,
    linkPrecision: 99,
    linkRecall: 98,
    linkF1: 98.5,
    exceptionPrecision: 95,
    exceptionRecall: 97,
    exceptionF1: 96,
    amountAccuracy: 100,
  };
  const baseline: Baseline = {
    stage: 'match',
    subset: 'ci',
    sets: 20,
    generatorVersion: 't',
    metrics,
  };

  it('a drop of exactly 2.0 points passes; 2.1 fails; a rise passes', () => {
    const at = (delta: number) =>
      compare({ ...metrics, exceptionRecall: metrics.exceptionRecall + delta }, baseline).find(
        (c) => c.metric === 'exceptionRecall',
      )!.failed;
    expect(at(-2.0)).toBe(false);
    expect(at(-2.1)).toBe(true);
    expect(at(+3)).toBe(false);
  });

  it('with no baseline nothing fails', () => {
    expect(compare(metrics, undefined).some((c) => c.failed)).toBe(false);
  });
});
