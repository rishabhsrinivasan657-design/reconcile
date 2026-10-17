import type { Clock } from './limiter.ts';

export interface AttemptInfo {
  attempt: number;
  error?: unknown;
  status?: number;
  waitMs?: number;
}

/** Best-effort HTTP status from errors thrown by provider SDKs and fetch. */
export function statusOf(err: unknown): number | undefined {
  const e = err as { status?: unknown; statusCode?: unknown; response?: { status?: unknown } };
  const s = e?.status ?? e?.statusCode ?? e?.response?.status;
  return typeof s === 'number' ? s : undefined;
}

function retryAfterMs(err: unknown): number | undefined {
  const e = err as { headers?: unknown; response?: { headers?: unknown } };
  const headers = (e?.headers ?? e?.response?.headers) as
    Record<string, string> | { get?: (k: string) => string | null } | undefined;
  const raw =
    typeof (headers as { get?: unknown })?.get === 'function'
      ? (headers as { get: (k: string) => string | null }).get('retry-after')
      : (headers as Record<string, string> | undefined)?.['retry-after'];
  if (!raw) return undefined;
  const secs = Number(raw);
  return Number.isFinite(secs) ? secs * 1000 : undefined;
}

export function isRetryable(err: unknown): boolean {
  const status = statusOf(err);
  if (status !== undefined) return status === 429 || status >= 500;
  const msg = String((err as Error)?.message ?? err);
  return /ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up/i.test(msg);
}

/**
 * Retry 429 / 5xx / network errors with exponential backoff and jitter, honoring Retry-After
 * (M3 AC-2). `onAttempt` sees every attempt so the call log is complete.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: {
    attempts?: number;
    clock: Clock;
    random?: () => number;
    onAttempt?: (info: AttemptInfo) => void;
  },
): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const random = opts.random ?? Math.random;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const status = statusOf(error);
      if (attempt >= attempts || !isRetryable(error)) {
        opts.onAttempt?.({ attempt, error, ...(status !== undefined ? { status } : {}) });
        throw error;
      }
      const waitMs =
        retryAfterMs(error) ?? Math.min(60_000, 2 ** attempt * 1000) * (0.5 + random() / 2);
      opts.onAttempt?.({ attempt, error, waitMs, ...(status !== undefined ? { status } : {}) });
      await opts.clock.sleep(waitMs);
    }
  }
}
