import type { LineRef, MatchResult } from '@reconcile/core';
import { describe, expect, it } from 'vitest';
import { compare } from './baseline.ts';
import { loadSubset, SUBSETS } from './load.ts';
import { score, type Scores } from './score.ts';

const sets = loadSubset(SUBSETS.ci);

/**
 * A perfect prediction built straight from the answer keys (not from the matcher, whose own
 * accuracy varies), so these tests check the scorer and nothing else.
 */
async function fresh(): Promise<MatchResult> {
  const ref = (setId: string, key?: string): LineRef | undefined => {
    if (!key) return undefined;
    const [role, n] = key.split(':');
    return { docId: `${setId}/${role}`, lineNo: Number(n) };
  };
  const roleOf = { po: 'po', rr: 'rr', 'inv-1': 'invoice', 'inv-2': 'duplicate' } as const;
  return {
    unassigned: [],
    groups: sets.map(({ truth }) => ({
      poNumber: truth.poNumber,
      notes: [],
      documents: truth.documents.map((d) => ({
        id: `${truth.setId}/${d.role}`,
        role: roleOf[d.role as keyof typeof roleOf],
      })),
      lineMatches: truth.lineMatches.map((m) => ({
        ...(m.po ? { po: ref(truth.setId, m.po)! } : {}),
        ...(m.rr ? { rr: ref(truth.setId, m.rr)! } : {}),
        ...(m.inv ? { inv: ref(truth.setId, m.inv)! } : {}),
        method: 'SKU' as const,
      })),
      exceptions: truth.exceptions.map((e) => ({
        type: e.type,
        lines: e.lineKeys.map((k) => ref(truth.setId, k)!),
        documentIds: e.documentRoles.map((r) => `${truth.setId}/${r}`),
        ...(e.type === 'MISSING_DOCUMENT'
          ? {
              missing:
                e.documentRoles[0] === 'inv-1'
                  ? ('invoice' as const)
                  : (e.documentRoles[0] as 'po' | 'rr'),
            }
          : {}),
        amount: e.amount,
        informational: e.informational,
        explanation: 'from the answer key',
      })),
    })),
  };
}

describe('scorer (M2 AC-11)', () => {
  it('a perfect prediction scores 100 everywhere', async () => {
    const r = score(sets, await fresh());
    for (const v of Object.values(r.scores)) expect(v).toBe(100);
    expect(r.mistakes).toEqual([]);
  });

  it('dropping one line match lowers link recall by exactly its pairs', async () => {
    const result = await fresh();
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

  it('a wrong amount counts as detected but lowers amount accuracy', async () => {
    const result = await fresh();
    const e = result.groups.flatMap((g) => g.exceptions).find((x) => !x.informational)!;
    e.amount = '0.01';
    const r = score(sets, result);
    expect(r.scores.exceptionRecall).toBe(100);
    expect(r.scores.amountAccuracy).toBeLessThan(100);
    expect(r.mistakes.map((m) => m.kind)).toEqual(['wrong_amount']);
  });

  it('a missing and an invented exception lower recall and precision', async () => {
    const result = await fresh();
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
  const metrics: Scores & Record<string, number> = {
    groupingAccuracy: 100,
    linkPrecision: 99,
    linkRecall: 98,
    linkF1: 98.5,
    exceptionPrecision: 95,
    exceptionRecall: 97,
    exceptionF1: 96,
    amountAccuracy: 100,
  };

  it('a drop of exactly 2.0 points passes; 2.1 fails; a rise passes', async () => {
    const at = (delta: number) =>
      compare(
        { ...metrics, exceptionRecall: metrics.exceptionRecall + delta },
        { ...metrics },
      ).find((c) => c.metric === 'exceptionRecall')!.failed;
    expect(at(-2.0)).toBe(false);
    expect(at(-2.1)).toBe(true);
    expect(at(+3)).toBe(false);
  });

  it('with no baseline nothing fails', async () => {
    expect(compare({ ...metrics }, undefined).some((c) => c.failed)).toBe(false);
  });
});
