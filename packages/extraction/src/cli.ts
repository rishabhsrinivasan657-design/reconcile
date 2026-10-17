/**
 * pnpm extract <file> [--provider openai] [--model gpt-6-luna] [--no-cache] [--json] [--threshold 0.8]
 * Reads one document with the LLM and prints what it saw (M3 AC-9).
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { usd } from '@reconcile/core';
import { createPrismaClient } from '@reconcile/db';
import {
  FileCacheStore,
  LlmClient,
  loadLlmEnv,
  MemoryCacheStore,
  MemorySink,
  PROVIDERS,
  describeKeySource,
  snapshotShellKeys,
  type CallSink,
  type Provider,
} from '@reconcile/llm';
import { DEFAULT_REVIEW_THRESHOLD, extractDocument } from './extract.ts';
import { mimeFor } from './pages.ts';

const shellKeys = snapshotShellKeys();
const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    provider: { type: 'string' },
    model: { type: 'string' },
    'no-cache': { type: 'boolean', default: false },
    json: { type: 'boolean', default: false },
    threshold: { type: 'string' },
  },
});
const file = positionals[0];
if (!file) {
  console.error(
    'Usage: pnpm extract <file.pdf|png|jpg> [--provider openai] [--model …] [--no-cache] [--json]',
  );
  process.exit(1);
}
if (values.provider && !PROVIDERS.includes(values.provider as Provider)) {
  console.error(`--provider must be one of: ${PROVIDERS.join(', ')}`);
  process.exit(1);
}

const env = loadLlmEnv();
const prisma = process.env.DATABASE_URL ? createPrismaClient() : undefined;
const memory = new MemorySink();
const sink: CallSink = {
  async record(call) {
    memory.record(call);
    if (!prisma) return;
    try {
      await prisma.llmCall.create({
        data: {
          provider: call.provider,
          model: call.model,
          promptVersion: call.promptVersion,
          purpose: call.purpose,
          documentRef: call.documentRef ?? null,
          latencyMs: Math.round(call.latencyMs),
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          cacheHit: call.cacheHit,
          costUsd: call.costUsd === null ? null : call.costUsd.toFixed(6),
          error: call.error ?? null,
        },
      });
    } catch (e) {
      console.warn(
        `(could not write LlmCall to the database: ${(e as Error).message.split('\n')[0]})`,
      );
    }
  },
};

const llm = new LlmClient({
  env,
  ...(values.provider ? { provider: values.provider as Provider } : {}),
  ...(values.model ? { model: values.model } : {}),
  cache: values['no-cache']
    ? new MemoryCacheStore()
    : new FileCacheStore(path.resolve(env.LLM_CACHE_DIR)),
  stateDir: path.resolve(env.LLM_CACHE_DIR),
  sink,
});

console.log(`key: ${describeKeySource(llm.provider, shellKeys)}`);
try {
  const bytes = new Uint8Array(fs.readFileSync(file));
  const r = await extractDocument(bytes, {
    llm,
    id: path.basename(file),
    mime: mimeFor(file),
    reviewThreshold: values.threshold ? Number(values.threshold) : DEFAULT_REVIEW_THRESHOLD,
  });
  if (values.json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    const d = r.document;
    const c = (k: string) => (r.confidence[k] === undefined ? '' : r.confidence[k]!.toFixed(2));
    console.log(
      `\n${path.basename(file)} · ${r.pages} page(s) · ${r.llm.provider}/${r.llm.model}${r.llm.cacheHit ? ' · cached' : ''}`,
    );
    if (d) {
      console.log(
        `\n  ${d.type}  ${d.docNumber} (conf ${c('docNumber')})  vendor: ${d.vendorName}  date: ${d.date}${d.poNumber ? `  PO: ${d.poNumber}` : ''}`,
      );
      console.log(
        `\n  ${'#'.padEnd(3)}${'SKU'.padEnd(14)}${'description'.padEnd(46)}${'qty'.padStart(5)}${'price'.padStart(11)}${'total'.padStart(12)}  min conf`,
      );
      d.lines.forEach((l, i) => {
        const confs = ['sku', 'description', 'qty', 'unitPrice', 'lineTotal']
          .map((f) => r.confidence[`lines.${i}.${f}`])
          .filter((x) => x !== undefined);
        console.log(
          `  ${String(l.lineNo).padEnd(3)}${(l.sku ?? '-').padEnd(14)}${l.description.slice(0, 44).padEnd(46)}${String(l.qty).padStart(5)}${(l.unitPrice ? usd(l.unitPrice) : '-').padStart(11)}${(l.lineTotal ? usd(l.lineTotal) : '-').padStart(12)}  ${confs.length ? Math.min(...confs).toFixed(2) : ''}`,
        );
      });
      if (d.total)
        console.log(
          `\n  subtotal ${d.subtotal ? usd(d.subtotal) : '-'} · tax ${d.tax ? usd(d.tax) : '-'} · shipping ${d.shipping ? usd(d.shipping) : '-'} · total ${usd(d.total)} (conf ${c('total')})`,
        );
    }
    console.log(
      r.needsReview
        ? `\n  ⚠ needs review:\n${r.reviewReasons.map((x) => `    - ${x}`).join('\n')}`
        : '\n  ✓ no review needed',
    );
    const u = r.llm.usage;
    console.log(
      `\n  tokens ${u.inputTokens} in / ${u.outputTokens} out · ${r.llm.costUsd === null ? 'cost unknown' : `$${r.llm.costUsd.toFixed(5)}`} · ${Math.round(r.llm.latencyMs)} ms · spent so far $${llm.spentUsd().toFixed(4)} of $${env.LLM_BUDGET_USD.toFixed(2)}`,
    );
  }
} catch (e) {
  console.error(`\n✗ ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await prisma?.$disconnect();
}
