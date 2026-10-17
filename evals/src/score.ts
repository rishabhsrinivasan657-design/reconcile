import type { ExceptionType, MatchException, MatchResult } from '@reconcile/core';
import { ExceptionType as ExceptionTypes } from '@reconcile/core';
import { roleOf, setOf, type LoadedSet } from './load.ts';

/** Quality metrics on a 0-100 scale (M2 AC-11). These are the ones the baseline gate checks. */
export interface Scores {
  groupingAccuracy: number;
  linkPrecision: number;
  linkRecall: number;
  linkF1: number;
  exceptionPrecision: number;
  exceptionRecall: number;
  exceptionF1: number;
  amountAccuracy: number;
}

export interface TypeRow {
  type: ExceptionType;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

export interface Mistake {
  kind:
    | 'false_positive'
    | 'false_negative'
    | 'wrong_amount'
    | 'wrong_group'
    | 'missed_link'
    | 'wrong_link';
  setId: string;
  key: string;
  detail: string;
}

export interface ScoreReport {
  scores: Scores;
  perType: TypeRow[];
  mistakes: Mistake[];
  counts: { sets: number; documents: number; trueExceptions: number; predictedExceptions: number };
}

const pct = (num: number, den: number) => (den === 0 ? 100 : (100 * num) / den);
const f1 = (p: number, r: number) => (p + r === 0 ? 0 : (2 * p * r) / (p + r));
const round = (n: number) => Math.round(n * 100) / 100;

/** "S0010|po:3|rr:5" for every pair of sides in a line match. */
function linkPairs(setId: string, keys: (string | undefined)[]): string[] {
  const present = keys.filter((k): k is string => k !== undefined);
  const out: string[] = [];
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) out.push(`${setId}|${present[i]}|${present[j]}`);
  }
  return out;
}

const missingRole = { po: 'po', rr: 'rr', invoice: 'inv-1' } as const;

/** Key that identifies "the same exception" in the answer key and in a prediction. */
function predictedKey(e: MatchException): { setId: string; key: string } {
  const anyId = e.lines[0]?.docId ?? e.documentIds[0] ?? '?/?';
  const setId = setOf(anyId);
  const what = e.lines.length
    ? e.lines.map((l) => `${roleOf(l.docId)}:${l.lineNo}`).sort()
    : e.missing
      ? [`docs:${missingRole[e.missing]}`]
      : e.documentIds.map((id) => `docs:${roleOf(id)}`).sort();
  return { setId, key: `${setId}|${e.type}|${what.join(',')}` };
}

export function score(sets: readonly LoadedSet[], result: MatchResult): ScoreReport {
  const mistakes: Mistake[] = [];

  // ---- grouping ----
  const trueGroup = new Map<string, string>(); // docId -> sorted ids of its true set
  for (const s of sets) {
    const ids = s.docs
      .map((d) => d.id)
      .sort()
      .join(',');
    for (const d of s.docs) trueGroup.set(d.id, ids);
  }
  let groupedRight = 0;
  for (const g of result.groups) {
    const ids = g.documents
      .map((d) => d.id)
      .sort()
      .join(',');
    for (const d of g.documents) {
      if (trueGroup.get(d.id) === ids) groupedRight++;
      else
        mistakes.push({
          kind: 'wrong_group',
          setId: setOf(d.id),
          key: d.id,
          detail: `grouped with ${ids}`,
        });
    }
  }
  const documents = trueGroup.size;

  // ---- line links ----
  const truePairs = new Set(
    sets.flatMap((s) =>
      s.truth.lineMatches.flatMap((m) => linkPairs(s.truth.setId, [m.po, m.rr, m.inv])),
    ),
  );
  const predPairs = new Set(
    result.groups.flatMap((g) =>
      g.lineMatches.flatMap((m) => {
        const ref = m.po ?? m.rr ?? m.inv;
        if (!ref) return [];
        const key = (r?: { docId: string; lineNo: number }) =>
          r ? `${roleOf(r.docId)}:${r.lineNo}` : undefined;
        return linkPairs(setOf(ref.docId), [key(m.po), key(m.rr), key(m.inv)]);
      }),
    ),
  );
  const linkTp = [...predPairs].filter((p) => truePairs.has(p)).length;
  for (const p of truePairs) {
    if (!predPairs.has(p))
      mistakes.push({
        kind: 'missed_link',
        setId: p.split('|')[0]!,
        key: p,
        detail: 'line pair in the answer key',
      });
  }
  for (const p of predPairs) {
    if (!truePairs.has(p))
      mistakes.push({
        kind: 'wrong_link',
        setId: p.split('|')[0]!,
        key: p,
        detail: 'paired lines that do not belong together',
      });
  }
  const linkPrecision = pct(linkTp, predPairs.size);
  const linkRecall = pct(linkTp, truePairs.size);

  // ---- exceptions ----
  const truth = new Map<
    string,
    { setId: string; type: ExceptionType; amount: string; informational: boolean }
  >();
  for (const s of sets) {
    for (const e of s.truth.exceptions) {
      const what = e.lineKeys.length
        ? [...e.lineKeys].sort()
        : e.documentRoles.map((r) => `docs:${r}`).sort();
      truth.set(`${s.truth.setId}|${e.type}|${what.join(',')}`, { setId: s.truth.setId, ...e });
    }
  }
  const predicted = new Map<string, MatchException & { setId: string }>();
  for (const e of result.groups.flatMap((g) => g.exceptions)) {
    const { setId, key } = predictedKey(e);
    predicted.set(key, { ...e, setId });
  }

  const perType = new Map<ExceptionType, { tp: number; fp: number; fn: number }>(
    ExceptionTypes.options.map((t) => [t, { tp: 0, fp: 0, fn: 0 }]),
  );
  let tp = 0;
  let amountsRight = 0;
  for (const [key, p] of predicted) {
    const t = truth.get(key);
    if (t) {
      tp++;
      perType.get(p.type)!.tp++;
      if (t.amount === p.amount && t.informational === p.informational) amountsRight++;
      else
        mistakes.push({
          kind: 'wrong_amount',
          setId: p.setId,
          key,
          detail: `expected ${t.amount}${t.informational ? ' (info)' : ''}, got ${p.amount}${p.informational ? ' (info)' : ''}`,
        });
    } else {
      perType.get(p.type)!.fp++;
      mistakes.push({ kind: 'false_positive', setId: p.setId, key, detail: p.explanation });
    }
  }
  for (const [key, t] of truth) {
    if (!predicted.has(key)) {
      perType.get(t.type)!.fn++;
      mistakes.push({
        kind: 'false_negative',
        setId: t.setId,
        key,
        detail: `missed ${t.type} ${t.amount}`,
      });
    }
  }
  const exceptionPrecision = pct(tp, predicted.size);
  const exceptionRecall = pct(tp, truth.size);

  return {
    scores: {
      groupingAccuracy: round(pct(groupedRight, documents)),
      linkPrecision: round(linkPrecision),
      linkRecall: round(linkRecall),
      linkF1: round(f1(linkPrecision, linkRecall)),
      exceptionPrecision: round(exceptionPrecision),
      exceptionRecall: round(exceptionRecall),
      exceptionF1: round(f1(exceptionPrecision, exceptionRecall)),
      amountAccuracy: round(pct(amountsRight, tp)),
    },
    perType: [...perType].map(([type, c]) => ({
      type,
      ...c,
      precision: round(pct(c.tp, c.tp + c.fp)),
      recall: round(pct(c.tp, c.tp + c.fn)),
    })),
    mistakes: mistakes.sort((a, b) => a.key.localeCompare(b.key)),
    counts: {
      sets: sets.length,
      documents,
      trueExceptions: truth.size,
      predictedExceptions: predicted.size,
    },
  };
}
