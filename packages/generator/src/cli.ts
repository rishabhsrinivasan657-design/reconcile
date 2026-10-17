/**
 * pnpm generate [--seed 42] [--sets 100] [--out evals/golden] [--config rates.json] [--scan-rate 0.2]
 * pnpm generate:ci   (seed 42, pool of 200 sets -> pick the 20-set CI subset -> evals/golden-ci)
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { PlantedErrorType, type GroundTruth } from '@reconcile/core';
import { buildCatalog } from './catalog/index.ts';
import { CI_SUBSET_SIZE, selectCiSubset, uncovered } from './ci-subset.ts';
import { resolveRates } from './config.ts';
import { generateSet, GENERATOR_VERSION, writeSet, type GeneratedSet } from './generate.ts';

const { values } = parseArgs({
  options: {
    seed: { type: 'string', default: '42' },
    sets: { type: 'string' },
    out: { type: 'string' },
    config: { type: 'string' },
    'scan-rate': { type: 'string' },
    ci: { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
  },
});

const seed = Number(values.seed);
// --ci draws its 20 sets from a larger pool so rare error types are covered at least twice.
const count = Number(values.sets ?? (values.ci ? 200 : 100));
if (!Number.isInteger(seed) || !Number.isInteger(count) || count < 1) {
  console.error('--seed and --sets must be integers (sets >= 1)');
  process.exit(1);
}

const override = values.config ? JSON.parse(await fs.readFile(values.config, 'utf8')) : {};
if (values['scan-rate'] !== undefined) override.scanRate = Number(values['scan-rate']);
const rates = resolveRates(override);
const outDir = path.resolve(values.out ?? (values.ci ? 'evals/golden-ci' : 'evals/golden'));

/** Remove previously generated set folders (S0001…) so stale sets never linger. */
async function clearSets(dir: string) {
  await fs.mkdir(dir, { recursive: true });
  for (const entry of await fs.readdir(dir)) {
    if (/^S\d{4}$/.test(entry)) await fs.rm(path.join(dir, entry), { recursive: true });
  }
}

function table(title: string, rows: [string, number | string][]) {
  const w = Math.max(...rows.map(([k]) => k.length), title.length);
  console.log(`\n${title}`);
  for (const [k, v] of rows) console.log(`  ${k.padEnd(w)}  ${String(v).padStart(6)}`);
}

const started = performance.now();
const catalog = buildCatalog();
const generated: GeneratedSet[] = [];
for (let i = 0; i < count; i++) {
  generated.push(await generateSet(catalog, rates, seed, i));
  if (!values.quiet && (i + 1) % 10 === 0) process.stdout.write(`  generated ${i + 1}/${count}\r`);
}

let keep = generated;
let subset: string[] | undefined;
if (values.ci) {
  subset = selectCiSubset(
    generated.map((g) => g.truth),
    CI_SUBSET_SIZE,
  );
  keep = generated.filter((g) => subset!.includes(g.truth.setId));
  const gaps = uncovered(
    generated.map((g) => g.truth),
    subset,
  );
  if (gaps.length > 0) console.warn(`\nCI subset coverage gaps: ${gaps.join(', ')}`);
}

await clearSets(outDir);
for (const set of keep) await writeSet(outDir, set);
const truths: GroundTruth[] = keep.map((g) => g.truth);
const manifest = {
  generatorVersion: GENERATOR_VERSION,
  seed,
  setsGenerated: count,
  setsWritten: keep.length,
  rates,
  ...(subset ? { ciSubset: subset } : {}),
};
await fs.writeFile(path.join(outDir, 'generation.json'), JSON.stringify(manifest, null, 2) + '\n');
if (subset) {
  await fs.writeFile(
    path.join(path.dirname(outDir), 'ci-subset.json'),
    JSON.stringify({ seed, generatorVersion: GENERATOR_VERSION, setIds: subset }, null, 2) + '\n',
  );
}

// ---- summary (AC-12) ------------------------------------------------------------------
const planted = new Map<string, number>(PlantedErrorType.options.map((t) => [t, 0]));
const exceptions = new Map<string, number>();
for (const t of truths) {
  for (const p of t.planted) planted.set(p.type, (planted.get(p.type) ?? 0) + 1);
  for (const e of t.exceptions) {
    const key = e.informational ? `${e.type} (info)` : e.type;
    exceptions.set(key, (exceptions.get(key) ?? 0) + 1);
  }
}
const docs = truths.flatMap((t) => t.documents);
const seconds = ((performance.now() - started) / 1000).toFixed(1);

const shownDir = path.relative(process.cwd(), outDir);
console.log(
  `\nReconcile generator v${GENERATOR_VERSION}: seed ${seed}, ${keep.length} sets -> ${shownDir.startsWith('..') ? outDir : shownDir || '.'}`,
);
table('Planted errors', [...planted]);
table('Expected exceptions', [...exceptions].sort());
table('Documents', [
  ['clean sets', truths.filter((t) => t.planted.length === 0).length],
  ['documents', docs.length],
  ['PNG scans', docs.filter((d) => d.format === 'png').length],
  ['multi-page', docs.filter((d) => d.pages > 1).length],
  ['line items', docs.reduce((s, d) => s + d.fields.lines.length, 0)],
]);
console.log(`\nDone in ${seconds}s`);
