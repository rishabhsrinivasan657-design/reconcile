import type { Limiter, Limits } from '@reconcile/llm';
import { DailyBudgetExceeded } from '@reconcile/llm';
import type { Redis } from 'ioredis';

/**
 * Token buckets kept in Redis so every worker process shares one rate limit (M4 AC-7).
 * Returns 0 and takes capacity when available, otherwise how many ms to wait.
 */
const TAKE = `
local function take(key, capacity, perMs, need, now)
  if capacity <= 0 then return 0 end
  local t = redis.call('HMGET', key, 'tokens', 'ts')
  local tokens = tonumber(t[1]) or capacity
  local ts = tonumber(t[2]) or now
  tokens = math.min(capacity, tokens + (now - ts) * perMs)
  if tokens >= need then
    redis.call('HSET', key, 'tokens', tokens - need, 'ts', now)
    redis.call('PEXPIRE', key, 120000)
    return 0
  end
  redis.call('HSET', key, 'tokens', tokens, 'ts', now)
  return math.ceil((need - tokens) / perMs)
end
local now = tonumber(ARGV[1])
local w1 = take(KEYS[1], tonumber(ARGV[2]), tonumber(ARGV[3]), 1, now)
if w1 > 0 then return w1 end
local w2 = take(KEYS[2], tonumber(ARGV[4]), tonumber(ARGV[5]), tonumber(ARGV[6]), now)
if w2 > 0 then
  -- give the request token back; nothing was sent
  redis.call('HINCRBYFLOAT', KEYS[1], 'tokens', 1)
  return w2
end
return 0`;

export class RedisLimiter implements Limiter {
  constructor(
    private readonly redis: Redis,
    private readonly limits: Limits,
    private readonly prefix = 'reconcile:llm',
    private readonly now: () => number = () => Date.now(),
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {}

  private dayKey(kind: 'req' | 'tok') {
    return `${this.prefix}:day:${new Date(this.now()).toISOString().slice(0, 10)}:${kind}`;
  }

  async acquire(estimatedTokens = 0): Promise<void> {
    const [req, tok] = await Promise.all([
      this.redis.get(this.dayKey('req')),
      this.redis.get(this.dayKey('tok')),
    ]);
    if (Number(req ?? 0) >= this.limits.rpd) {
      throw new DailyBudgetExceeded(
        `Daily request budget (${this.limits.rpd}) reached; resume tomorrow.`,
      );
    }
    if (this.limits.tpd && Number(tok ?? 0) + estimatedTokens > this.limits.tpd) {
      throw new DailyBudgetExceeded(
        `Daily token budget (${this.limits.tpd}) would be exceeded; resume tomorrow.`,
      );
    }
    const tpm = this.limits.tpm ?? 0;
    const need = tpm ? Math.min(estimatedTokens, tpm) : 0;
    for (;;) {
      const wait = Number(
        await this.redis.eval(
          TAKE,
          2,
          `${this.prefix}:rpm`,
          `${this.prefix}:tpm`,
          this.now(),
          this.limits.rpm,
          this.limits.rpm / 60_000,
          tpm,
          tpm / 60_000,
          need,
        ),
      );
      if (wait <= 0) break;
      await this.sleep(wait);
    }
    const key = this.dayKey('req');
    await this.redis
      .multi()
      .incr(key)
      .expire(key, 2 * 86_400)
      .exec();
  }

  async settle(estimatedTokens: number, actualTokens: number): Promise<void> {
    const tpm = this.limits.tpm ?? 0;
    const multi = this.redis.multi();
    if (tpm)
      multi.hincrbyfloat(
        `${this.prefix}:tpm`,
        'tokens',
        Math.min(estimatedTokens, tpm) - actualTokens,
      );
    const key = this.dayKey('tok');
    await multi
      .incrby(key, actualTokens)
      .expire(key, 2 * 86_400)
      .exec();
  }
}
