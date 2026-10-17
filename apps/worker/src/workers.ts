import type { FuzzyMatcher } from '@reconcile/core';
import type { PrismaClient } from '@reconcile/db';
import {
  BudgetExceeded,
  DailyBudgetExceeded,
  isPermanentQuotaError,
  type LlmClient,
} from '@reconcile/llm';
import {
  markFailed,
  matchPurchaseOrder,
  QUEUE,
  readDocument,
  type MatchJob,
  type Queues,
  type ReadJob,
  type Storage,
} from '@reconcile/pipeline';
import { UnrecoverableError, Worker, type Job } from 'bullmq';
import type { Redis } from 'ioredis';

export interface WorkerDeps {
  db: PrismaClient;
  storage: Storage;
  llm: LlmClient;
  queues: Queues;
  connection: Redis;
  graceDays: number;
  fuzzy?: FuzzyMatcher;
  /** Called after each job, for logs and tests. */
  onEvent?: (e: { job: 'read' | 'match'; ok: boolean; detail: string }) => void;
}

/** Errors that retrying can't fix: stop at once (M4 AC-4). */
const permanent = (e: unknown) =>
  e instanceof BudgetExceeded || e instanceof DailyBudgetExceeded || isPermanentQuotaError(e);

/** The two background jobs of ADR-0011: "read this document" and "match this PO". */
export function startWorkers(deps: WorkerDeps) {
  const { db, connection } = deps;

  const read = new Worker<ReadJob>(
    QUEUE.read,
    async (job: Job<ReadJob>) => {
      try {
        const r = await readDocument(db, deps, job.data.documentId);
        if (r.poNumber) await deps.queues.enqueueMatch(r.poNumber);
        deps.onEvent?.({
          job: 'read',
          ok: true,
          detail: `${job.data.documentId} → ${r.status}${r.poNumber ? ` (${r.poNumber})` : ''}`,
        });
        return r;
      } catch (e) {
        if (permanent(e)) throw new UnrecoverableError((e as Error).message);
        throw e;
      }
    },
    { connection, concurrency: 2 },
  );
  read.on('failed', async (job, err) => {
    if (!job) return;
    const final = err instanceof UnrecoverableError || job.attemptsMade >= (job.opts.attempts ?? 1);
    if (final) await markFailed(db, job.data.documentId, err.message);
    deps.onEvent?.({
      job: 'read',
      ok: false,
      detail: `${job.data.documentId}: ${err.message.slice(0, 200)}${final ? ' (gave up)' : ' (will retry)'}`,
    });
  });

  const match = new Worker<MatchJob>(
    QUEUE.match,
    async (job: Job<MatchJob>) => {
      const outcomes = await matchPurchaseOrder(db, job.data.poNumber, {
        graceDays: deps.graceDays,
        ...(deps.fuzzy ? { fuzzy: deps.fuzzy } : {}),
      });
      for (const o of outcomes) {
        // Grace period: re-check when it ends (M4 AC-6).
        if (o.waitingUntil) {
          await deps.queues.match.add(
            'match',
            { poNumber: o.poNumber },
            {
              delay: Math.max(0, o.waitingUntil.getTime() - Date.now()),
              jobId: `grace-${o.poNumber}-${o.waitingUntil.getTime()}`,
              removeOnComplete: 1000,
            },
          );
        }
      }
      deps.onEvent?.({
        job: 'match',
        ok: true,
        detail:
          outcomes
            .map((o) => `${o.poNumber}: ${o.status}${o.provisional ? ' (provisional)' : ''}`)
            .join(', ') || `${job.data.poNumber}: nothing to match`,
      });
      return outcomes;
    },
    { connection, concurrency: 1 },
  );
  match.on('failed', (job, err) =>
    deps.onEvent?.({
      job: 'match',
      ok: false,
      detail: `${job?.data.poNumber}: ${err.message.slice(0, 200)}`,
    }),
  );

  return {
    read,
    match,
    close: async () => {
      await Promise.all([read.close(), match.close()]);
    },
  };
}
