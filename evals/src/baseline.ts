import fs from 'node:fs';
import path from 'node:path';
import { evalsDir, type Subset } from './load.ts';
import type { Scores } from './score.ts';

export const BASELINE_PATH = path.join(evalsDir, 'baseline.json');
/** FR-17: fail when any quality metric drops by more than this many points. */
export const MAX_DROP = 2.0;

export const METRIC_LABELS: Record<keyof Scores, string> = {
  groupingAccuracy: 'grouping accuracy',
  linkPrecision: 'link precision',
  linkRecall: 'link recall',
  linkF1: 'link F1',
  exceptionPrecision: 'exception precision',
  exceptionRecall: 'exception recall',
  exceptionF1: 'exception F1',
  amountAccuracy: 'amount accuracy',
};

export interface Baseline {
  stage: 'match';
  subset: Subset;
  sets: number;
  generatorVersion: string;
  metrics: Scores;
}

export interface Comparison {
  metric: keyof Scores;
  score: number;
  baseline: number | undefined;
  delta: number | undefined;
  failed: boolean;
}

export function readBaseline(file = BASELINE_PATH): Baseline | undefined {
  return fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')) as Baseline) : undefined;
}

export function writeBaseline(b: Baseline, file = BASELINE_PATH): void {
  fs.writeFileSync(file, JSON.stringify(b, null, 2) + '\n');
}

/** Compare each metric with the baseline; rises always pass, drops over MAX_DROP fail (AC-12). */
export function compare(scores: Scores, baseline: Baseline | undefined): Comparison[] {
  return (Object.keys(METRIC_LABELS) as (keyof Scores)[]).map((metric) => {
    const base = baseline?.metrics[metric];
    const delta = base === undefined ? undefined : Math.round((scores[metric] - base) * 100) / 100;
    return {
      metric,
      score: scores[metric],
      baseline: base,
      delta,
      failed: delta !== undefined && delta < -MAX_DROP - 1e-9,
    };
  });
}
