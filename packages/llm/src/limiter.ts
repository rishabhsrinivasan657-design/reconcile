import fs from 'node:fs';
import path from 'node:path';

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

export class DailyBudgetExceeded extends Error {
  override name = 'DailyBudgetExceeded';
}

/** What the LLM client needs from a rate limiter; in-process or shared via Redis (M4 AC-7). */
export interface Limiter {
  acquire(estimatedTokens?: number): Promise<void>;
  settle(estimatedTokens: number, actualTokens: number): void | Promise<void>;
}

export interface Limits {
  rpm: number;
  rpd: number;
  /** Tokens per minute (e.g. Groq free tier 8K); undefined = no token limit. */
  tpm?: number;
  /** Tokens per day (e.g. Groq free tier 200K). */
  tpd?: number;
}

interface DayState {
  day: string;
  count: number;
  tokens: number;
}

/**
 * Rate limiter (M3 AC-2): token buckets for requests/minute and (optionally) tokens/minute,
 * plus per-day request and token counters persisted to disk so a restart doesn't reset them.
 * Waits for capacity; throws DailyBudgetExceeded when today's budget is spent.
 */
export class RateLimiter implements Limiter {
  private reqTokens: number;
  private tpmTokens: number;
  private last: number;
  private memoryDay: DayState = { day: '', count: 0, tokens: 0 };

  constructor(
    private readonly limits: Limits,
    private readonly dayFile: string | undefined,
    private readonly clock: Clock = realClock,
  ) {
    this.reqTokens = limits.rpm;
    this.tpmTokens = limits.tpm ?? 0;
    this.last = clock.now();
  }

  private today(): string {
    return new Date(this.clock.now()).toISOString().slice(0, 10);
  }

  private readDay(): DayState {
    const fresh = { day: this.today(), count: 0, tokens: 0 };
    if (!this.dayFile) return this.memoryDay.day === fresh.day ? this.memoryDay : fresh;
    if (!fs.existsSync(this.dayFile)) return fresh;
    const saved = JSON.parse(fs.readFileSync(this.dayFile, 'utf8')) as Partial<DayState>;
    return saved.day === fresh.day
      ? { day: fresh.day, count: saved.count ?? 0, tokens: saved.tokens ?? 0 }
      : fresh;
  }

  private writeDay(state: DayState): void {
    if (!this.dayFile) {
      this.memoryDay = state;
      return;
    }
    fs.mkdirSync(path.dirname(this.dayFile), { recursive: true });
    fs.writeFileSync(this.dayFile, JSON.stringify(state));
  }

  private refill(): void {
    const now = this.clock.now();
    const elapsed = now - this.last;
    this.last = now;
    this.reqTokens = Math.min(
      this.limits.rpm,
      this.reqTokens + (elapsed * this.limits.rpm) / 60_000,
    );
    if (this.limits.tpm) {
      this.tpmTokens = Math.min(
        this.limits.tpm,
        this.tpmTokens + (elapsed * this.limits.tpm) / 60_000,
      );
    }
  }

  /** Reserve one request and an estimated number of tokens. */
  async acquire(estimatedTokens = 0): Promise<void> {
    const day = this.readDay();
    if (day.count >= this.limits.rpd) {
      throw new DailyBudgetExceeded(
        `Daily request budget (${this.limits.rpd}) reached; resume tomorrow. Cached results are kept.`,
      );
    }
    if (this.limits.tpd && day.tokens + estimatedTokens > this.limits.tpd) {
      throw new DailyBudgetExceeded(
        `Daily token budget (${this.limits.tpd}) would be exceeded (${day.tokens} used); resume tomorrow. Cached results are kept, so re-running continues where it stopped.`,
      );
    }
    const need = this.limits.tpm ? Math.min(estimatedTokens, this.limits.tpm) : 0;
    for (;;) {
      this.refill();
      const reqWait = this.reqTokens >= 1 ? 0 : ((1 - this.reqTokens) * 60_000) / this.limits.rpm;
      const tokWait =
        this.limits.tpm && this.tpmTokens < need
          ? ((need - this.tpmTokens) * 60_000) / this.limits.tpm
          : 0;
      const wait = Math.ceil(Math.max(reqWait, tokWait));
      if (wait === 0) break;
      await this.clock.sleep(wait);
    }
    this.reqTokens -= 1;
    if (this.limits.tpm) this.tpmTokens -= need;
    this.writeDay({ ...day, count: day.count + 1 });
  }

  /** After a call: correct the token estimate with what was actually used. */
  settle(estimatedTokens: number, actualTokens: number): void {
    if (this.limits.tpm) {
      this.tpmTokens -= actualTokens - Math.min(estimatedTokens, this.limits.tpm);
    }
    const day = this.readDay();
    this.writeDay({ ...day, tokens: day.tokens + actualTokens });
  }
}
