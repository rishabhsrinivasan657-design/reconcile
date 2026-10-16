import { PlantedErrorType, type GroundTruth } from '@reconcile/core';
import { TEMPLATE_FAMILIES } from './catalog/index.ts';

export const CI_SUBSET_SIZE = 20;

/** Coverage goals for the committed CI subset (M1 AC-17). */
function needsOf(t: GroundTruth): string[] {
  return [
    ...t.planted.map((p) => `error:${p.type}`),
    ...t.documents.map((d) => `template:${d.template}`),
    ...t.documents.map((d) => `format:${d.format}`),
    ...(t.documents.some((d) => d.pages > 1) ? ['multipage'] : []),
  ];
}

function targets(): Map<string, number> {
  const goal = new Map<string, number>();
  for (const type of PlantedErrorType.options) goal.set(`error:${type}`, 2);
  for (const family of TEMPLATE_FAMILIES) goal.set(`template:${family}`, 1);
  goal.set('format:pdf', 1);
  goal.set('format:png', 1);
  goal.set('multipage', 1);
  return goal;
}

/**
 * Deterministic greedy pick: repeatedly take the set that covers the most unmet goals, then
 * top up with clean sets so precision (no false alarms) is tested too.
 */
export function selectCiSubset(truths: readonly GroundTruth[], size = CI_SUBSET_SIZE): string[] {
  const remaining = targets();
  const chosen: string[] = [];
  const pool = [...truths];

  const gain = (t: GroundTruth) => {
    const counts = new Map<string, number>();
    for (const n of needsOf(t)) counts.set(n, (counts.get(n) ?? 0) + 1);
    let g = 0;
    for (const [n, c] of counts) g += Math.min(c, remaining.get(n) ?? 0);
    return g;
  };

  while (chosen.length < size) {
    let best: GroundTruth | undefined;
    let bestGain = 0;
    for (const t of pool) {
      const g = gain(t);
      if (g > bestGain) [best, bestGain] = [t, g];
    }
    if (!best) break;
    chosen.push(best.setId);
    pool.splice(pool.indexOf(best), 1);
    for (const n of needsOf(best)) {
      const left = remaining.get(n);
      if (left) remaining.set(n, left - 1);
    }
  }

  const clean = pool.filter((t) => t.planted.length === 0);
  for (const t of [...clean, ...pool.filter((t) => t.planted.length > 0)]) {
    if (chosen.length >= size) break;
    if (!chosen.includes(t.setId)) chosen.push(t.setId);
  }
  return chosen.sort();
}

/** Goals that the chosen subset still misses (empty when coverage is complete). */
export function uncovered(truths: readonly GroundTruth[], ids: readonly string[]): string[] {
  const remaining = targets();
  for (const t of truths.filter((x) => ids.includes(x.setId))) {
    for (const n of needsOf(t)) {
      const left = remaining.get(n);
      if (left) remaining.set(n, left - 1);
    }
  }
  return [...remaining]
    .filter(([, left]) => left > 0)
    .map(([n, left]) => `${n} (short by ${left})`);
}
