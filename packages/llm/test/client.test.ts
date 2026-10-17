import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { BudgetExceeded, SpendLedger } from '../src/budget.ts';
import { MemoryCacheStore } from '../src/cache.ts';
import { LlmClient, ReplayMiss, type Invoker } from '../src/client.ts';
import { DailyBudgetExceeded, RateLimiter } from '../src/limiter.ts';
import { estimateCost } from '../src/prices.ts';
import { parseJsonText } from '../src/providers.ts';
import { withRetry } from '../src/retry.ts';
import { MemorySink } from '../src/sinks.ts';
import { fakeClock, testEnv, tmpDir } from './helpers.ts';

const Answer = z.object({ total: z.string() });
const req = (over = {}) => ({
  purpose: 'EXTRACT' as const,
  promptVersion: 'extract.v1',
  system: 'read the document',
  userText: 'extract',
  schema: Answer,
  cacheKeyParts: ['sha-of-file'],
  documentRef: 'S0001/inv-1',
  maxOutputTokens: 2000,
  ...over,
});
const okInvoker = (): Invoker & { calls: number } => {
  const fn = (async () => {
    fn.calls++;
    return { parsed: { total: '10.00' }, usage: { inputTokens: 2000, outputTokens: 1000 } };
  }) as Invoker & { calls: number };
  fn.calls = 0;
  return fn;
};

describe('rate limiter (AC-2)', () => {
  it('waits when the per-minute bucket is empty', async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ rpm: 10, rpd: 1000 }, undefined, clock);
    for (let i = 0; i < 10; i++) await rl.acquire();
    expect(clock.slept).toEqual([]);
    await rl.acquire();
    expect(clock.slept[0]).toBe(6000); // 1 token at 10/min
  });

  it('refuses once the daily budget is used, and the count survives a restart', async () => {
    const clock = fakeClock();
    const file = `${tmpDir()}/day.json`;
    const a = new RateLimiter({ rpm: 100, rpd: 3 }, file, clock);
    for (let i = 0; i < 3; i++) await a.acquire();
    const b = new RateLimiter({ rpm: 100, rpd: 3 }, file, clock);
    await expect(b.acquire()).rejects.toThrow(DailyBudgetExceeded);
    await expect(b.acquire()).rejects.toThrow(/resume tomorrow/);
  });
});

describe('token limits (Groq free tier: 8K/min, 200K/day)', () => {
  it('waits for tokens-per-minute capacity, corrected by actual usage', async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ rpm: 30, rpd: 1000, tpm: 8000 }, undefined, clock);
    await rl.acquire(6000);
    rl.settle(6000, 7000); // the call actually used 7,000 tokens
    await rl.acquire(6000); // only 1,000 left: wait for 5,000 more at 8,000/min
    expect(clock.slept[0]).toBe(37500);
  });

  it('refuses a call that would exceed the daily token budget', async () => {
    const clock = fakeClock();
    const rl = new RateLimiter({ rpm: 30, rpd: 1000, tpd: 10_000 }, `${tmpDir()}/day.json`, clock);
    await rl.acquire(6000);
    rl.settle(6000, 6000);
    await expect(rl.acquire(6000)).rejects.toThrow(/Daily token budget/);
  });
});

describe('retry (AC-2)', () => {
  it('honors Retry-After on 429 and gives up after 5 attempts', async () => {
    const clock = fakeClock();
    const attempts: number[] = [];
    const err = Object.assign(new Error('rate limited'), {
      status: 429,
      headers: { 'retry-after': '3' },
    });
    await expect(
      withRetry(
        async () => {
          throw err;
        },
        { clock, onAttempt: (a) => attempts.push(a.attempt) },
      ),
    ).rejects.toThrow('rate limited');
    expect(attempts).toEqual([1, 2, 3, 4, 5]);
    expect(clock.slept).toEqual([3000, 3000, 3000, 3000]);
  });

  it('does not retry a 429 that means no credits or quota left', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(
        new Error('429 You have no credits remaining. Add credits to continue.'),
        { status: 429 },
      );
    });
    await expect(withRetry(fn, { clock: fakeClock() })).rejects.toThrow(/no credits/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry a 400', async () => {
    const fn = vi.fn(async () => {
      throw Object.assign(new Error('bad request'), { status: 400 });
    });
    await expect(withRetry(fn, { clock: fakeClock() })).rejects.toThrow('bad request');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially with jitter when there is no Retry-After', async () => {
    const clock = fakeClock();
    let n = 0;
    const result = await withRetry(
      async () => {
        if (++n < 3) throw Object.assign(new Error('busy'), { status: 503 });
        return 'ok';
      },
      { clock, random: () => 1 },
    );
    expect(result).toBe('ok');
    expect(clock.slept).toEqual([2000, 4000]);
  });
});

describe('cache and replay (AC-3, AC-14)', () => {
  it('a second identical request makes zero provider calls and is logged as a cache hit', async () => {
    const invoker = okInvoker();
    const sink = new MemorySink();
    const client = new LlmClient({
      env: testEnv(),
      cache: new MemoryCacheStore(),
      sink,
      invoker,
      clock: fakeClock(),
    });
    const a = await client.generateStructured(req());
    const b = await client.generateStructured(req());
    expect(invoker.calls).toBe(1);
    expect([a.cacheHit, b.cacheHit]).toEqual([false, true]);
    expect(b.costUsd).toBe(a.costUsd);
    expect(sink.calls.map((c) => c.cacheHit)).toEqual([false, true]);
  });

  it('a different prompt version or model misses the cache', async () => {
    const invoker = okInvoker();
    const cache = new MemoryCacheStore();
    const env = testEnv();
    await new LlmClient({ env, cache, invoker, clock: fakeClock() }).generateStructured(req());
    await new LlmClient({ env, cache, invoker, clock: fakeClock() }).generateStructured(
      req({ promptVersion: 'extract.v2' }),
    );
    await new LlmClient({
      env,
      cache,
      invoker,
      clock: fakeClock(),
      model: 'gpt-5-mini',
    }).generateStructured(req());
    expect(invoker.calls).toBe(3);
  });

  it('replay mode never calls the provider and explains a miss', async () => {
    const invoker = okInvoker();
    const client = new LlmClient({
      env: testEnv(),
      cache: new MemoryCacheStore(),
      invoker,
      mode: 'replay',
      clock: fakeClock(),
    });
    await expect(client.generateStructured(req())).rejects.toThrow(ReplayMiss);
    await expect(client.generateStructured(req())).rejects.toThrow(
      /re-record with `pnpm eval:record`/,
    );
    expect(invoker.calls).toBe(0);
  });
});

describe('budget guard (AC-4b)', () => {
  it('refuses a live call that could cross the cap, before sending it', async () => {
    const env = testEnv({ LLM_BUDGET_USD: '0.01' });
    const invoker = okInvoker();
    const client = new LlmClient({
      env,
      cache: new MemoryCacheStore(),
      invoker,
      clock: fakeClock(),
    });
    new SpendLedger(0.01, `${env.LLM_CACHE_DIR}/_spend.json`).add(0.0099);
    await expect(client.generateStructured(req())).rejects.toThrow(BudgetExceeded);
    expect(invoker.calls).toBe(0);
  });

  it('records actual spend from token usage', async () => {
    const env = testEnv();
    const client = new LlmClient({
      env,
      cache: new MemoryCacheStore(),
      invoker: okInvoker(),
      clock: fakeClock(),
    });
    const r = await client.generateStructured(req());
    expect(r.costUsd).toBeCloseTo(
      estimateCost('gpt-6-luna', { inputTokens: 2000, outputTokens: 1000 })!,
      10,
    );
    expect(client.spentUsd()).toBeCloseTo(r.costUsd!, 10);
  });

  it('refuses models with no known price instead of guessing', async () => {
    const client = new LlmClient({
      env: testEnv(),
      model: 'mystery-model',
      cache: new MemoryCacheStore(),
      invoker: okInvoker(),
      clock: fakeClock(),
    });
    await expect(client.generateStructured(req())).rejects.toThrow(/No list price known/);
  });
});

describe('validation and repair', () => {
  it('repairs an invalid answer once, then succeeds', async () => {
    let n = 0;
    const invoker: Invoker = async () => ({
      parsed: ++n === 1 ? { total: 10 } : { total: '10.00' },
      usage: { inputTokens: 100, outputTokens: 50 },
    });
    const r = await new LlmClient({
      env: testEnv(),
      cache: new MemoryCacheStore(),
      invoker,
      clock: fakeClock(),
    }).generateStructured(req());
    expect(r.liveCalls).toBe(2);
    expect(r.usage).toEqual({ inputTokens: 200, outputTokens: 100 });
  });

  it('fails after a second invalid answer and logs the error', async () => {
    const sink = new MemorySink();
    const invoker: Invoker = async () => ({
      parsed: { nope: true },
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await expect(
      new LlmClient({
        env: testEnv(),
        cache: new MemoryCacheStore(),
        invoker,
        sink,
        clock: fakeClock(),
      }).generateStructured(req()),
    ).rejects.toThrow(/after one repair/);
    expect(sink.calls.at(-1)?.error).toMatch(/schema validation failed/);
  });
});

describe('JSON-mode parsing (Gemini, Groq)', () => {
  it('parses plain or fenced JSON, and returns null for prose', () => {
    expect(parseJsonText('{"total":"1.00"}')).toEqual({ total: '1.00' });
    expect(parseJsonText('```json\n{"total":"1.00"}\n```')).toEqual({ total: '1.00' });
    expect(parseJsonText('Sure! Here is the data.')).toBeNull();
    expect(parseJsonText('Here you go: {"total":"1.00",} Hope that helps')).toEqual({
      total: '1.00',
    });
  });
});
