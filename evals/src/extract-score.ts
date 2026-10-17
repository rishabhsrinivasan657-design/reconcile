import { Decimal, type TruthDocument } from '@reconcile/core';
import type { ExtractionResult } from '@reconcile/extraction';

/** Extraction quality on a 0-100 scale (M3 AC-10). Gated by the baseline. */
export interface ExtractScores {
  fieldPrecision: number;
  fieldRecall: number;
  fieldF1: number;
  fieldF1Pdf: number;
  fieldF1Scan: number;
  docTypeAccuracy: number;
}

/** Reported, not gated (M3 AC-12, AC-13, Q3). */
export interface ExtractReported {
  locationHitRate: number;
  reviewRate: number;
  catchRate: number;
  documents: number;
  failedDocuments: number;
  costUsd: number | null;
  costPerSetUsd: number | null;
  costPerDocUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
}

export interface FieldRow {
  field: string;
  tp: number;
  fp: number;
  fn: number;
  precision: number;
  recall: number;
}

export interface ExtractError {
  docId: string;
  field: string;
  expected: string | null;
  got: string | null;
  flagged: boolean;
}

export interface ExtractInput {
  docId: string;
  setId: string;
  truth: TruthDocument;
  result: ExtractionResult | { error: string };
}

type Kind = 'text' | 'code' | 'money' | 'date' | 'qty' | 'upper';
const HEADER: [keyof TruthDocument['fields'], Kind][] = [
  ['vendorName', 'text'],
  ['docNumber', 'code'],
  ['poNumber', 'code'],
  ['date', 'date'],
  ['dueDate', 'date'],
  ['subtotal', 'money'],
  ['tax', 'money'],
  ['shipping', 'money'],
  ['total', 'money'],
];
const LINE: [string, Kind][] = [
  ['sku', 'code'],
  ['description', 'text'],
  ['qty', 'qty'],
  ['uom', 'upper'],
  ['unitPrice', 'money'],
  ['lineTotal', 'money'],
];

const norm: Record<Kind, (v: unknown) => string> = {
  // Punctuation is kept: a "corrected" typo is a reading error (we score what is printed).
  text: (v) => String(v).toLowerCase().replace(/\s+/g, ' ').trim(),
  code: (v) => String(v).toUpperCase().replace(/\s+/g, ''),
  upper: (v) => String(v).toUpperCase().trim(),
  money: (v) => new Decimal(String(v)).toFixed(4),
  date: (v) => String(v),
  qty: (v) => String(Number(v)),
};
const same = (kind: Kind, a: unknown, b: unknown) => {
  try {
    return norm[kind](a) === norm[kind](b);
  } catch {
    return false;
  }
};

const pct = (num: number, den: number) => (den === 0 ? 100 : (100 * num) / den);
const f1 = (p: number, r: number) => (p + r === 0 ? 0 : (2 * p * r) / (p + r));
const round = (n: number) => Math.round(n * 100) / 100;

function iou(a: number[], b: number[]): number {
  const [ax0, ay0, ax1, ay1] = a as [number, number, number, number];
  const [bx0, by0, bx1, by1] = b as [number, number, number, number];
  const w = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0));
  const h = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
  const inter = w * h;
  const union = (ax1 - ax0) * (ay1 - ay0) + (bx1 - bx0) * (by1 - by0) - inter;
  return union > 0 ? inter / union : 0;
}

type PLine = NonNullable<ExtractionResult['document']>['lines'][number];
type TLine = TruthDocument['fields']['lines'][number];

/** Order-preserving best alignment of predicted lines to answer-key lines (design 4.2). */
export function alignLines(truth: TLine[], pred: PLine[]): [number, number][] {
  const score = (t: TLine, p: PLine) =>
    (t.sku && p.sku && same('code', t.sku.value, p.sku) ? 2 : 0) +
    (same('text', t.description.value, p.description) ? 2 : 0) +
    (same('qty', t.qty.value, p.qty) ? 1 : 0) +
    (t.lineTotal && p.lineTotal && same('money', t.lineTotal.value, p.lineTotal) ? 1 : 0);
  const n = truth.length;
  const m = pred.length;
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const s = score(truth[i - 1]!, pred[j - 1]!);
      dp[i]![j] = Math.max(
        dp[i - 1]![j]!,
        dp[i]![j - 1]!,
        s > 0 ? dp[i - 1]![j - 1]! + s : -Infinity,
      );
    }
  }
  const pairs: [number, number][] = [];
  for (let i = n, j = m; i > 0 && j > 0;) {
    const s = score(truth[i - 1]!, pred[j - 1]!);
    if (s > 0 && dp[i]![j] === dp[i - 1]![j - 1]! + s) {
      pairs.unshift([i - 1, j - 1]);
      i--;
      j--;
    } else if (dp[i]![j] === dp[i - 1]![j]) i--;
    else j--;
  }
  return pairs;
}

export function scoreExtraction(inputs: readonly ExtractInput[], perSetCount: number) {
  const rows = new Map<string, { tp: number; fp: number; fn: number }>();
  const row = (f: string) => {
    const r = rows.get(f) ?? { tp: 0, fp: 0, fn: 0 };
    rows.set(f, r);
    return r;
  };
  const byFormat = { pdf: { tp: 0, fp: 0, fn: 0 }, png: { tp: 0, fp: 0, fn: 0 } };
  const errors: ExtractError[] = [];
  let docTypeRight = 0;
  let locHits = 0;
  let locTotal = 0;
  let flaggedDocs = 0;
  let failed = 0;
  let errorsCaught = 0;
  let errorCount = 0;
  let cost: number | null = 0;
  let inTok = 0;
  let outTok = 0;
  const latencies: number[] = [];

  for (const { docId, truth, result } of inputs) {
    const fmt = byFormat[truth.format];
    const ok = 'document' in result ? result : undefined;
    const doc = ok?.document;
    if (ok) {
      latencies.push(ok.llm.latencyMs);
      inTok += ok.llm.usage.inputTokens;
      outTok += ok.llm.usage.outputTokens;
      cost = cost === null || ok.llm.costUsd === null ? null : cost + ok.llm.costUsd;
      if (ok.needsReview) flaggedDocs++;
    }
    if (!doc) failed++;
    if (doc?.type === truth.type) docTypeRight++;
    const flagged = ok?.needsReview ?? true;

    const judge = (
      field: string,
      kind: Kind,
      t: { value: unknown; page: number; bbox: number[] } | undefined,
      p: unknown,
      predKey: string,
    ) => {
      const r = row(field);
      const hasT = t !== undefined && t.value !== null && t.value !== undefined;
      const hasP = p !== undefined && p !== null && p !== '';
      if (hasT && hasP && same(kind, t.value, p)) {
        r.tp++;
        fmt.tp++;
        const loc = ok?.locations[predKey];
        if (loc?.bbox) {
          locTotal++;
          if (loc.page === t.page && iou(loc.bbox, t.bbox) >= 0.3) locHits++;
        }
        return;
      }
      if (hasP) {
        r.fp++;
        fmt.fp++;
      }
      if (hasT) {
        r.fn++;
        fmt.fn++;
      }
      if (hasT || hasP) {
        errorCount++;
        if (flagged) errorsCaught++;
        errors.push({
          docId,
          field,
          expected: hasT ? String(t!.value) : null,
          got: hasP ? String(p) : null,
          flagged,
        });
      }
    };

    const f = truth.fields;
    for (const [key, kind] of HEADER) {
      judge(
        key,
        kind,
        f[key] as never,
        doc ? (doc as Record<string, unknown>)[key] : undefined,
        key,
      );
    }
    const predLines = doc?.lines ?? [];
    const pairs = alignLines(f.lines, predLines);
    const pairedT = new Set(pairs.map(([t]) => t));
    const pairedP = new Set(pairs.map(([, p]) => p));
    for (const [ti, pi] of pairs) {
      const t = f.lines[ti]!;
      const p = predLines[pi]!;
      for (const [k, kind] of LINE) {
        judge(
          `lines.${k}`,
          kind,
          (t as Record<string, unknown>)[k] as never,
          (p as Record<string, unknown>)[k],
          `lines.${pi}.${k}`,
        );
      }
    }
    f.lines.forEach((t, ti) => {
      if (pairedT.has(ti)) return;
      for (const [k, kind] of LINE)
        judge(`lines.${k}`, kind, (t as Record<string, unknown>)[k] as never, undefined, '');
    });
    predLines.forEach((p, pi) => {
      if (pairedP.has(pi)) return;
      for (const [k, kind] of LINE)
        judge(`lines.${k}`, kind, undefined, (p as Record<string, unknown>)[k], '');
    });
  }

  const sum = [...rows.values()].reduce(
    (a, r) => ({ tp: a.tp + r.tp, fp: a.fp + r.fp, fn: a.fn + r.fn }),
    { tp: 0, fp: 0, fn: 0 },
  );
  const P = pct(sum.tp, sum.tp + sum.fp);
  const R = pct(sum.tp, sum.tp + sum.fn);
  const fmtF1 = (x: { tp: number; fp: number; fn: number }) =>
    x.tp + x.fp + x.fn === 0 ? 100 : f1(pct(x.tp, x.tp + x.fp), pct(x.tp, x.tp + x.fn));
  latencies.sort((a, b) => a - b);
  const q = (p: number) =>
    latencies.length
      ? latencies[Math.min(latencies.length - 1, Math.floor(p * latencies.length))]!
      : 0;

  const scores: ExtractScores = {
    fieldPrecision: round(P),
    fieldRecall: round(R),
    fieldF1: round(f1(P, R)),
    fieldF1Pdf: round(fmtF1(byFormat.pdf)),
    fieldF1Scan: round(fmtF1(byFormat.png)),
    docTypeAccuracy: round(pct(docTypeRight, inputs.length)),
  };
  const reported: ExtractReported = {
    locationHitRate: round(pct(locHits, locTotal)),
    reviewRate: round(pct(flaggedDocs, inputs.length)),
    catchRate: round(pct(errorsCaught, errorCount)),
    documents: inputs.length,
    failedDocuments: failed,
    costUsd: cost === null ? null : +cost.toFixed(6),
    costPerSetUsd: cost === null || perSetCount === 0 ? null : +(cost / perSetCount).toFixed(6),
    costPerDocUsd: cost === null || inputs.length === 0 ? null : +(cost / inputs.length).toFixed(6),
    inputTokens: inTok,
    outputTokens: outTok,
    latencyP50Ms: Math.round(q(0.5)),
    latencyP95Ms: Math.round(q(0.95)),
  };
  const perField: FieldRow[] = [...rows]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([field, r]) => ({
      field,
      ...r,
      precision: round(pct(r.tp, r.tp + r.fp)),
      recall: round(pct(r.tp, r.tp + r.fn)),
    }));
  return { scores, reported, perField, errors };
}
