import fs from 'node:fs';
import path from 'node:path';
import { evalsDir } from './load.ts';

export const BASELINE_PATH = path.join(evalsDir, 'baseline.json');
/** FR-17: fail when any gated metric drops by more than this many points. */
export const MAX_DROP = 2.0;

export type Stage = 'match' | 'extract' | 'e2e';

export const METRIC_LABELS: Record<string, string> = {
  groupingAccuracy: 'grouping accuracy',
  linkPrecision: 'link precision',
  linkRecall: 'link recall',
  linkF1: 'link F1',
  exceptionPrecision: 'exception precision',
  exceptionRecall: 'exception recall',
  exceptionF1: 'exception F1',
  amountAccuracy: 'amount accuracy',
  fieldPrecision: 'field precision',
  fieldRecall: 'field recall',
  fieldF1: 'field F1',
  fieldF1Pdf: 'field F1 (PDF)',
  fieldF1Scan: 'field F1 (scan)',
  docTypeAccuracy: 'doc type accuracy',
};

export interface StageBaseline {
  stage: Stage;
  subset: string;
  sets: number;
  generatorVersion: string;
  provider?: string;
  model?: string;
  promptVersion?: string;
  metrics: Record<string, number>;
}

export type BaselineFile = Partial<Record<Stage, StageBaseline>>;

export interface Comparison {
  metric: string;
  score: number;
  baseline: number | undefined;
  delta: number | undefined;
  failed: boolean;
}

export function readBaseline(file = BASELINE_PATH): BaselineFile {
  if (!fs.existsSync(file)) return {};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as BaselineFile & {
    metrics?: unknown;
    stage?: Stage;
  };
  // M2 wrote a single flat baseline for the match stage.
  if (raw.metrics && raw.stage) return { [raw.stage]: raw as unknown as StageBaseline };
  return raw;
}

export function writeStageBaseline(b: StageBaseline, file = BASELINE_PATH): void {
  const all = readBaseline(file);
  all[b.stage] = b;
  const ordered: BaselineFile = {};
  for (const s of ['match', 'extract', 'e2e'] as const) if (all[s]) ordered[s] = all[s];
  fs.writeFileSync(file, JSON.stringify(ordered, null, 2) + '\n');
}

/** Rises always pass; drops over MAX_DROP fail (FR-17, M2 AC-12, M3 AC-14). */
export function compare(
  scores: Record<string, number>,
  base: Record<string, number> | undefined,
): Comparison[] {
  return Object.keys(scores).map((metric) => {
    const b = base?.[metric];
    const delta = b === undefined ? undefined : Math.round((scores[metric]! - b) * 100) / 100;
    return {
      metric,
      score: scores[metric]!,
      baseline: b,
      delta,
      failed: delta !== undefined && delta < -MAX_DROP - 1e-9,
    };
  });
}
