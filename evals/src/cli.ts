/**
 * pnpm eval [--subset ci|full] [--check-baseline] [--update-baseline]
 * Scores the matcher against answer keys (M2: inputs are the answer keys' own field values).
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { matchDocuments } from '@reconcile/core';
import { compare, MAX_DROP, METRIC_LABELS, readBaseline, writeBaseline } from './baseline.ts';
import { evalsDir, loadSubset, SUBSETS, type Subset } from './load.ts';
import { score } from './score.ts';

const { values } = parseArgs({
  options: {
    subset: { type: 'string', default: 'ci' },
    dir: { type: 'string' },
    'check-baseline': { type: 'boolean', default: false },
    'update-baseline': { type: 'boolean', default: false },
  },
});
const subset = values.subset as Subset;
if (!(subset in SUBSETS)) {
  console.error(`--subset must be one of: ${Object.keys(SUBSETS).join(', ')}`);
  process.exit(1);
}

const sets = loadSubset(values.dir ? path.resolve(values.dir) : SUBSETS[subset]);
const pile = sets.flatMap((s) => s.docs).sort((a, b) => a.id.localeCompare(b.id));
const result = matchDocuments(pile);
const report = score(sets, result);

// Latency per set (NFR-09), timed separately so the scored run stays a single mixed pile.
const timings = sets
  .map((s) => {
    const t0 = performance.now();
    matchDocuments(s.docs);
    return performance.now() - t0;
  })
  .sort((a, b) => a - b);
const pctl = (p: number) => timings[Math.min(timings.length - 1, Math.floor(p * timings.length))]!;
const latency = { p50Ms: +pctl(0.5).toFixed(2), p95Ms: +pctl(0.95).toFixed(2) };

const generatorVersion = sets[0]?.truth.generatorVersion ?? 'unknown';
const baseline = readBaseline();
const comparable = !values.dir && baseline?.subset === subset && baseline.stage === 'match';
const rows = compare(report.scores, comparable ? baseline : undefined);

// ---- scoreboard ----
const pad = (s: string | number, n: number, left = false) =>
  left ? String(s).padEnd(n) : String(s).padStart(n);
const fmt = (n: number | undefined) => (n === undefined ? '-' : n.toFixed(1));
console.log(
  `\nReconcile eval · stage: match · inputs: answer keys · subset: ${subset} (${report.counts.sets} sets, ${report.counts.documents} docs)\n`,
);
console.log(
  `  ${pad('metric', 22, true)}${pad('score', 7)}${pad('baseline', 10)}${pad('change', 9)}`,
);
for (const r of rows) {
  const change = r.delta === undefined ? '-' : `${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}`;
  console.log(
    `  ${pad(METRIC_LABELS[r.metric], 22, true)}${pad(fmt(r.score), 7)}${pad(fmt(r.baseline), 10)}${pad(change, 9)}${r.failed ? '  ✗' : ''}`,
  );
}
console.log(
  `\n  ${pad('per type', 26, true)}${pad('TP', 4)}${pad('FP', 4)}${pad('FN', 4)}${pad('P', 8)}${pad('R', 8)}`,
);
for (const t of report.perType) {
  console.log(
    `  ${pad(t.type, 26, true)}${pad(t.tp, 4)}${pad(t.fp, 4)}${pad(t.fn, 4)}${pad(t.precision.toFixed(1), 8)}${pad(t.recall.toFixed(1), 8)}`,
  );
}
const fuzzyLinks = result.groups.flatMap((g) => g.lineMatches).filter((m) => m.method === 'FUZZY');
console.log(`\n  fuzzy (description-only) pairs: ${fuzzyLinks.length}`);
console.log(`\n  latency per set  p50 ${latency.p50Ms} ms · p95 ${latency.p95Ms} ms`);
if (report.mistakes.length) {
  console.log(`\n  ${report.mistakes.length} mistake(s):`);
  for (const m of report.mistakes.slice(0, 15))
    console.log(`   - ${m.kind}: ${m.key}  (${m.detail})`);
  if (report.mistakes.length > 15) console.log('   … see the results JSON for the rest');
}

// ---- results file ----
const resultsDir = path.join(evalsDir, 'results');
fs.mkdirSync(resultsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const resultsFile = path.join(resultsDir, `${stamp}-match-${subset}.json`);
fs.writeFileSync(
  resultsFile,
  JSON.stringify(
    { stage: 'match', subset, generatorVersion, ...report, latency, comparison: rows },
    null,
    2,
  ) + '\n',
);
console.log(`\n  results: ${path.relative(process.cwd(), resultsFile)}`);

// ---- baseline ----
if (values['update-baseline']) {
  writeBaseline({
    stage: 'match',
    subset,
    sets: report.counts.sets,
    generatorVersion,
    metrics: report.scores,
  });
  console.log('  baseline updated: evals/baseline.json (commit it with a reason)');
}
if (values['check-baseline']) {
  if (!comparable) {
    console.error(
      `  ✗ no baseline for stage "match" on subset "${subset}" (run --update-baseline)`,
    );
    process.exit(1);
  }
  const failed = rows.filter((r) => r.failed);
  if (failed.length) {
    console.error(
      `  ✗ dropped more than ${MAX_DROP} points: ${failed.map((f) => `${METRIC_LABELS[f.metric]} (${f.delta})`).join(', ')}`,
    );
    process.exit(1);
  }
  console.log(`  ✓ within ${MAX_DROP} points of baseline`);
}
