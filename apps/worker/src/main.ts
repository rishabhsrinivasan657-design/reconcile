import fs from 'node:fs';
import path from 'node:path';
import { createPrismaClient } from '@reconcile/db';
import { loadLlmEnv, PROVIDER_LIMITS } from '@reconcile/llm';
import {
  createPipelineLlm,
  createQueues,
  loadPipelineEnv,
  LocalStorage,
  redisEventBus,
  RedisLimiter,
} from '@reconcile/pipeline';
import { fuzzyFor } from '@reconcile/extraction';
import { Redis } from 'ioredis';
import { startWorkers } from './workers.ts';

const rootEnv = path.resolve(import.meta.dirname, '../../../.env');
if (fs.existsSync(rootEnv)) process.loadEnvFile(rootEnv);
process.chdir(path.resolve(import.meta.dirname, '../../..'));

const env = loadPipelineEnv();
const llmEnv = loadLlmEnv();
const caps = PROVIDER_LIMITS[llmEnv.LLM_PROVIDER];
const db = createPrismaClient(env.DATABASE_URL);
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
const queues = createQueues(connection);
// One rate limit for every worker process, kept in Redis (M4 AC-7).
const limiter = new RedisLimiter(
  connection,
  {
    rpm: llmEnv.LLM_RPM ?? caps.rpm,
    rpd: llmEnv.LLM_RPD ?? caps.rpd,
    ...((llmEnv.LLM_TPM ?? caps.tpm) ? { tpm: (llmEnv.LLM_TPM ?? caps.tpm)! } : {}),
    ...((llmEnv.LLM_TPD ?? caps.tpd) ? { tpd: (llmEnv.LLM_TPD ?? caps.tpd)! } : {}),
  },
  `reconcile:llm:${llmEnv.LLM_PROVIDER}`,
);
const llm = createPipelineLlm(env, db, limiter);
// How tricky lines are paired; hybrid won the M4 comparison (text first, AI for the rest).
const fuzzy = fuzzyFor(env.FUZZY_STRATEGY, llm);

const workers = startWorkers({
  db,
  storage: new LocalStorage(path.resolve(env.STORAGE_DIR)),
  llm,
  queues,
  connection,
  graceDays: env.MISSING_DOC_GRACE_DAYS,
  ...(fuzzy ? { fuzzy } : {}),
  events: redisEventBus(connection),
  onEvent: (e) => console.log(`[${e.job}] ${e.ok ? '✓' : '✗'} ${e.detail}`),
});
console.log(
  `Reconcile worker running · ${llmEnv.LLM_PROVIDER}/${llmEnv.LLM_MODEL_EXTRACT} · AI mode ${env.LLM_MODE} · line pairing ${env.FUZZY_STRATEGY} · grace ${env.MISSING_DOC_GRACE_DAYS} day(s)`,
);

const shutdown = async () => {
  await workers.close();
  await queues.close();
  connection.disconnect();
  await db.$disconnect();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
