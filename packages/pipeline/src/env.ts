import { loadEnv, postgresUrl } from '@reconcile/core';
import { z } from 'zod';

/** Settings shared by the API and the worker (M4). */
export const PipelineEnv = z.object({
  DATABASE_URL: postgresUrl,
  REDIS_URL: z.string().default('redis://localhost:6379'),
  STORAGE_DIR: z.string().default('storage'),
  /** Days to wait for a missing document before raising MISSING_DOCUMENT (M4 AC-6). */
  MISSING_DOC_GRACE_DAYS: z.coerce.number().min(0).default(7),
  /** How tricky lines are paired: text matcher, AI, or text first then AI (M4 AC-10). */
  FUZZY_STRATEGY: z.enum(['text', 'llm', 'hybrid']).default('hybrid'),
  /** 'replay' uses only recorded AI answers (tests, CI); 'live' calls the provider. */
  LLM_MODE: z.enum(['live', 'replay']).default('live'),
  /** Where recorded/cached AI answers live. */
  LLM_ANSWER_CACHE_DIR: z.string().default('storage/llm-cache'),
  API_PORT: z.coerce.number().default(3001),
  /** Live demo only (ADR-0016): when set, changes need this password. Unset locally. */
  DEMO_PASSWORD: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(8).optional()),
  /** Signs the "changes unlocked" cookie; required when DEMO_PASSWORD is set. */
  DEMO_COOKIE_SECRET: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.string().min(32).optional(),
  ),
});
export type PipelineEnv = z.infer<typeof PipelineEnv>;

export const loadPipelineEnv = (source: Record<string, string | undefined> = process.env) =>
  loadEnv(PipelineEnv, source);
