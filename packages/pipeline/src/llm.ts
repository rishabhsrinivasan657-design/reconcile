import path from 'node:path';
import type { PrismaClient } from '@reconcile/db';
import { FileCacheStore, LlmClient, loadLlmEnv, type CallSink, type Limiter } from '@reconcile/llm';
import type { PipelineEnv } from './env.ts';

/** Log every LLM call as an LlmCall row, linked to the document it was for (FR-18). */
export function prismaSink(db: PrismaClient): CallSink {
  return {
    async record(call) {
      const documentId = call.documentRef?.replace(/ \(self-check\)$/, '');
      const exists = documentId
        ? await db.document.findUnique({ where: { id: documentId }, select: { id: true } })
        : null;
      await db.llmCall.create({
        data: {
          ...(exists ? { documentId: exists.id } : {}),
          documentRef: call.documentRef ?? null,
          provider: call.provider,
          model: call.model,
          promptVersion: call.promptVersion,
          purpose: call.purpose,
          latencyMs: Math.round(call.latencyMs),
          inputTokens: call.inputTokens,
          outputTokens: call.outputTokens,
          cacheHit: call.cacheHit,
          costUsd: call.costUsd === null ? null : call.costUsd.toFixed(6),
          error: call.error ?? null,
        },
      });
    },
  };
}

/** The worker's LLM client: answer cache on disk, shared rate limit, DB call log. */
export function createPipelineLlm(
  env: PipelineEnv,
  db: PrismaClient,
  limiter?: Limiter,
): LlmClient {
  const llmEnv = loadLlmEnv();
  return new LlmClient({
    env: llmEnv,
    cache: new FileCacheStore(path.resolve(env.LLM_ANSWER_CACHE_DIR)),
    stateDir: path.resolve(llmEnv.LLM_CACHE_DIR),
    mode: env.LLM_MODE,
    sink: prismaSink(db),
    ...(limiter ? { limiter } : {}),
  });
}
