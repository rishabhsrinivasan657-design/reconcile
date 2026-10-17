/**
 * pnpm eval [--stage match|extract|e2e|all] [--subset ci|full] [--dir <folder>]
 *           [--live] [--provider openai] [--model gpt-6-luna] [--check-baseline] [--update-baseline]
 *
 * match:   matcher on perfect inputs (answer-key values)                     (M2)
 * extract: LLM reading accuracy vs the answer keys                           (M3)
 * e2e:     LLM reading -> matcher -> exceptions vs the answer keys           (M3)
 * extract/e2e REPLAY recorded answers from evals/cache by default (no key, no spend).
 * --live allows real calls (pnpm eval:record); every call is cached, budget-capped, rate-limited.
 */
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { matchDocuments, type ExtractedDocument } from '@reconcile/core';
import {
  EXTRACT_PROMPT,
  extractDocument,
  mimeFor,
  type ExtractionResult,
} from '@reconcile/extraction';
import {
  FileCacheStore,
  LlmClient,
  loadLlmEnv,
  MemorySink,
  PROVIDERS,
  ReplayMiss,
  BudgetExceeded,
  describeKeySource,
  snapshotShellKeys,
  DailyBudgetExceeded,
  type Provider,
} from '@reconcile/llm';
import {
  compare,
  MAX_DROP,
  METRIC_LABELS,
  readBaseline,
  writeStageBaseline,
  type Comparison,
  type Stage,
} from './baseline.ts';
import { scoreExtraction, type ExtractInput } from './extract-score.ts';
import { evalsDir, loadSubset, SUBSETS, type LoadedSet, type Subset } from './load.ts';
import { score } from './score.ts';

const shellKeys = snapshotShellKeys();
const rootEnv = path.resolve(evalsDir, '../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const { values } = parseArgs({
  options: {
    stage: { type: 'string', default: 'match' },
    subset: { type: 'string', default: 'ci' },
    dir: { type: 'string' },
    live: { type: 'boolean', default: false },
    provider: { type: 'string' },
    model: { type: 'string' },
    concurrency: { type: 'string', default: '4' },
    'check-baseline': { type: 'boolean', default: false },
    'update-baseline': { type: 'boolean', default: false },
  },
});
const subset = values.subset as Subset;
if (!(subset in SUBSETS))
  throw new Error(`--subset must be one of: ${Object.keys(SUBSETS).join(', ')}`);
const stages: Stage[] =
  values.stage === 'all' ? ['match', 'extract', 'e2e'] : [values.stage as Stage];
if (!stages.every((s) => ['match', 'extract', 'e2e'].includes(s)))
  throw new Error('--stage must be match, extract, e2e, or all');
if (values.provider && !PROVIDERS.includes(values.provider as Provider))
  throw new Error(`--provider must be one of: ${PROVIDERS.join(', ')}`);

const dataDir = values.dir ? path.resolve(values.dir) : SUBSETS[subset];
const subsetName = values.dir ? path.basename(dataDir) : subset;
const sets = loadSubset(dataDir);
const generatorVersion = sets[0]?.truth.generatorVersion ?? 'unknown';
const baselines = readBaseline();
const gateable = !values.dir;
const results: Record<string, unknown> = { subset: subsetName, generatorVersion, stages: {} };
const failures: string[] = [];

const pad = (s: string | number, n: number, left = false) =>
  left ? String(s).padEnd(n) : String(s).padStart(n);
const fmt = (n: number | undefined) => (n === undefined ? '-' : n.toFixed(1));

function printScores(title: string, rows: Comparison[]) {
  console.log(`\n${title}\n`);
  console.log(
    `  ${pad('metric', 22, true)}${pad('score', 7)}${pad('baseline', 10)}${pad('change', 9)}`,
  );
  for (const r of rows) {
    const change = r.delta === undefined ? '-' : `${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}`;
    console.log(
      `  ${pad(METRIC_LABELS[r.metric] ?? r.metric, 22, true)}${pad(fmt(r.score), 7)}${pad(fmt(r.baseline), 10)}${pad(change, 9)}${r.failed ? '  ✗' : ''}`,
    );
  }
}

function gate(
  stage: Stage,
  scores: Record<string, number>,
  extra: Partial<{ provider: string; model: string; promptVersion: string }> = {},
) {
  const base = gateable ? baselines[stage] : undefined;
  const sameRun =
    base && base.subset === subsetName && (!extra.model || base.model === extra.model);
  const rows = compare(scores, sameRun ? base.metrics : undefined);
  if (values['update-baseline'] && gateable) {
    writeStageBaseline({
      stage,
      subset: subsetName,
      sets: sets.length,
      generatorVersion,
      ...extra,
      metrics: scores,
    });
    console.log(`  baseline updated for stage "${stage}" (commit it with a reason)`);
  }
  if (values['check-baseline']) {
    if (!sameRun)
      failures.push(
        `no ${stage} baseline for subset "${subsetName}"${extra.model ? ` and model ${extra.model}` : ''}`,
      );
    for (const r of rows.filter((x) => x.failed))
      failures.push(`${stage}: ${METRIC_LABELS[r.metric] ?? r.metric} dropped ${r.delta}`);
  }
  return rows;
}

// ---- match (perfect inputs) ----------------------------------------------------------
function runMatch(docsBySet: LoadedSet[], label: string) {
  const pile = docsBySet.flatMap((s) => s.docs).sort((a, b) => a.id.localeCompare(b.id));
  const result = matchDocuments(pile);
  return { result, report: score(docsBySet, result), label };
}

if (stages.includes('match')) {
  const { result, report } = runMatch(sets, 'match');
  const timings = sets
    .map((s) => {
      const t0 = performance.now();
      matchDocuments(s.docs);
      return performance.now() - t0;
    })
    .sort((a, b) => a - b);
  const rows = gate('match', report.scores as unknown as Record<string, number>);
  printScores(
    `Reconcile eval · stage: match · inputs: answer keys · subset: ${subsetName} (${report.counts.sets} sets, ${report.counts.documents} docs)`,
    rows,
  );
  console.log(
    `\n  ${pad('per type', 26, true)}${pad('TP', 4)}${pad('FP', 4)}${pad('FN', 4)}${pad('P', 8)}${pad('R', 8)}`,
  );
  for (const t of report.perType)
    console.log(
      `  ${pad(t.type, 26, true)}${pad(t.tp, 4)}${pad(t.fp, 4)}${pad(t.fn, 4)}${pad(t.precision.toFixed(1), 8)}${pad(t.recall.toFixed(1), 8)}`,
    );
  const fuzzy = result.groups.flatMap((g) => g.lineMatches).filter((m) => m.method === 'FUZZY');
  console.log(`\n  fuzzy (description-only) pairs: ${fuzzy.length}`);
  console.log(
    `  latency per set  p50 ${timings[Math.floor(timings.length / 2)]!.toFixed(2)} ms · p95 ${timings[Math.min(timings.length - 1, Math.floor(timings.length * 0.95))]!.toFixed(2)} ms`,
  );
  (results.stages as Record<string, unknown>).match = {
    ...report,
    comparison: rows,
    fuzzyLinks: fuzzy,
  };
}

// ---- extraction (needed by extract and e2e) -------------------------------------------
if (stages.includes('extract') || stages.includes('e2e')) {
  const env = loadLlmEnv();
  const provider = (values.provider as Provider | undefined) ?? env.LLM_PROVIDER;
  const model = values.model ?? env.LLM_MODEL_EXTRACT;
  const sink = new MemorySink();
  if (values.live) console.log(`key: ${describeKeySource(provider, shellKeys)}`);
  const llm = new LlmClient({
    env,
    provider,
    model,
    sink,
    cache: new FileCacheStore(path.join(evalsDir, 'cache')),
    mode: values.live ? 'live' : 'replay',
    stateDir: path.resolve(evalsDir, '..', env.LLM_CACHE_DIR),
  });
  const jobs = sets.flatMap((s) =>
    s.truth.documents.map((d) => ({ set: s, doc: d, docId: `${s.truth.setId}/${d.role}` })),
  );
  const extracted = new Map<string, ExtractionResult | { error: string }>();
  let fatal: Error | undefined;
  let next = 0;
  const worker = async () => {
    while (!fatal && next < jobs.length) {
      const job = jobs[next++]!;
      try {
        const bytes = new Uint8Array(
          fs.readFileSync(path.join(dataDir, job.set.truth.setId, job.doc.file)),
        );
        extracted.set(
          job.docId,
          await extractDocument(bytes, { llm, id: job.docId, mime: mimeFor(job.doc.file) }),
        );
        if (values.live)
          process.stdout.write(
            `  extracted ${extracted.size}/${jobs.length} · spent $${llm.spentUsd().toFixed(4)}\r`,
          );
      } catch (e) {
        if (
          e instanceof ReplayMiss ||
          e instanceof BudgetExceeded ||
          e instanceof DailyBudgetExceeded
        )
          fatal = e;
        else extracted.set(job.docId, { error: (e as Error).message.slice(0, 300) });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, worker));
  if (fatal) {
    console.error(`\n✗ ${fatal.message}`);
    process.exit(1);
  }

  if (stages.includes('extract')) {
    const inputs: ExtractInput[] = jobs.map((j) => ({
      docId: j.docId,
      setId: j.set.truth.setId,
      truth: j.doc,
      result: extracted.get(j.docId)!,
    }));
    const ex = scoreExtraction(inputs, sets.length);
    const rows = gate('extract', ex.scores as unknown as Record<string, number>, {
      provider,
      model,
      promptVersion: EXTRACT_PROMPT.version,
    });
    printScores(
      `Reconcile eval · stage: extract · ${provider}/${model} · prompt ${EXTRACT_PROMPT.version} · subset: ${subsetName} (${ex.reported.documents} docs)${values.live ? '' : ' · replay'}`,
      rows,
    );
    console.log(
      `\n  ${pad('per field', 20, true)}${pad('TP', 5)}${pad('FP', 5)}${pad('FN', 5)}${pad('P', 8)}${pad('R', 8)}`,
    );
    for (const f of ex.perField)
      console.log(
        `  ${pad(f.field, 20, true)}${pad(f.tp, 5)}${pad(f.fp, 5)}${pad(f.fn, 5)}${pad(f.precision.toFixed(1), 8)}${pad(f.recall.toFixed(1), 8)}`,
      );
    const r = ex.reported;
    console.log(
      `\n  reported (not gated): location hit ${r.locationHitRate.toFixed(1)}% · review rate ${r.reviewRate.toFixed(1)}% · catch rate ${r.catchRate.toFixed(1)}% · failed docs ${r.failedDocuments}`,
    );
    console.log(
      `  cost: ${r.costUsd === null ? 'unknown' : `$${r.costUsd.toFixed(4)} total · $${r.costPerDocUsd!.toFixed(5)}/doc · $${r.costPerSetUsd!.toFixed(5)}/set`} · tokens ${r.inputTokens} in / ${r.outputTokens} out · latency p50 ${r.latencyP50Ms} ms · p95 ${r.latencyP95Ms} ms`,
    );
    if (ex.errors.length) {
      console.log(`\n  ${ex.errors.length} field error(s), first 10:`);
      for (const e of ex.errors.slice(0, 10))
        console.log(
          `   - ${e.docId} ${e.field}: expected ${JSON.stringify(e.expected)}, got ${JSON.stringify(e.got)}${e.flagged ? ' (flagged)' : ''}`,
        );
    }
    (results.stages as Record<string, unknown>).extract = {
      provider,
      model,
      promptVersion: EXTRACT_PROMPT.version,
      ...ex,
      comparison: rows,
      calls: sink.calls,
    };
  }

  if (stages.includes('e2e')) {
    const aiSets: LoadedSet[] = sets.map((s) => ({
      truth: s.truth,
      docs: s.truth.documents
        .map((d) => extracted.get(`${s.truth.setId}/${d.role}`))
        .flatMap((r) =>
          r && 'document' in r && r.document ? [r.document as ExtractedDocument] : [],
        ),
    }));
    const { report } = runMatch(aiSets, 'e2e');
    const rows = gate('e2e', report.scores as unknown as Record<string, number>, {
      provider,
      model,
      promptVersion: EXTRACT_PROMPT.version,
    });
    printScores(
      `Reconcile eval · stage: e2e · ${provider}/${model} reads → matcher · subset: ${subsetName}`,
      rows,
    );
    const perfect = (results.stages as Record<string, { scores?: Record<string, number> }>).match
      ?.scores;
    if (perfect) {
      console.log(
        `\n  ${pad('vs perfect inputs', 22, true)}${pad('match', 8)}${pad('e2e', 8)}${pad('gap', 8)}`,
      );
      for (const k of Object.keys(report.scores)) {
        const a = perfect[k]!;
        const b = (report.scores as unknown as Record<string, number>)[k]!;
        console.log(
          `  ${pad(METRIC_LABELS[k] ?? k, 22, true)}${pad(a.toFixed(1), 8)}${pad(b.toFixed(1), 8)}${pad((b - a).toFixed(1), 8)}`,
        );
      }
    }
    console.log(
      `\n  ${report.mistakes.length} mistake(s)${report.mistakes.length ? ', first 10:' : ''}`,
    );
    for (const m of report.mistakes.slice(0, 10))
      console.log(`   - ${m.kind}: ${m.key}  (${m.detail})`);
    (results.stages as Record<string, unknown>).e2e = {
      provider,
      model,
      ...report,
      comparison: rows,
    };
  }
}

// ---- results file (never contains secrets) ---------------------------------------------
const resultsDir = path.join(evalsDir, 'results');
fs.mkdirSync(resultsDir, { recursive: true });
const out = JSON.stringify(results, null, 2);
if (/\b(sk-[A-Za-z0-9_-]{16,}|AIza[0-9A-Za-z_-]{20,})/.test(out))
  throw new Error('Refusing to write results: they contain something that looks like an API key.');
const file = path.join(
  resultsDir,
  `${new Date().toISOString().replace(/[:.]/g, '-')}-${stages.join('+')}-${subsetName}.json`,
);
fs.writeFileSync(file, out + '\n');
console.log(`\n  results: ${path.relative(process.cwd(), file)}`);

if (values['check-baseline']) {
  if (failures.length) {
    console.error(`  ✗ ${failures.join('; ')} (max allowed drop ${MAX_DROP} points)`);
    process.exit(1);
  }
  console.log(`  ✓ within ${MAX_DROP} points of baseline`);
}
