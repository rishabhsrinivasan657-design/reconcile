import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export const QUEUE = { read: 'read-document', match: 'match-po' } as const;

export interface ReadJob {
  documentId: string;
}
export interface MatchJob {
  poNumber: string;
}

/** Queues shared by the API (adds jobs) and the worker (processes them). ADR-0011. */
export function createQueues(connection: Redis) {
  const read = new Queue<ReadJob>(QUEUE.read, { connection });
  const match = new Queue<MatchJob>(QUEUE.match, { connection });
  return {
    read,
    match,
    /** One read job per file: the document id is unique per file fingerprint. */
    enqueueRead: (documentId: string) =>
      read.add(
        'read',
        { documentId },
        {
          jobId: `read-${documentId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      ),
    /**
     * Debounced per PO: jobs added while one waits are merged; if one is running, exactly one
     * more runs after it, so a document arriving mid-match is never missed.
     */
    enqueueMatch: (poNumber: string, delayMs = 2000) =>
      match.add(
        'match',
        { poNumber },
        {
          delay: delayMs,
          deduplication: { id: `match-${poNumber}`, keepLastIfActive: true },
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      ),
    close: async () => {
      await Promise.all([read.close(), match.close()]);
    },
  };
}
export type Queues = ReturnType<typeof createQueues>;
