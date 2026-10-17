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

/**
 * Token bucket for requests per minute, plus a per-day request counter persisted to disk so a
 * restart doesn't reset it (M3 AC-2). Waits for a token; throws when the day's budget is spent.
 */
export class RateLimiter {
  private tokens: number;
  private last: number;

  constructor(
    private readonly rpm: number,
    private readonly rpd: number,
    private readonly dayFile: string | undefined,
    private readonly clock: Clock = realClock,
  ) {
    this.tokens = rpm;
    this.last = clock.now();
  }

  private day(): string {
    return new Date(this.clock.now()).toISOString().slice(0, 10);
  }

  private readDay(): { day: string; count: number } {
    if (!this.dayFile || !fs.existsSync(this.dayFile)) return { day: this.day(), count: 0 };
    const saved = JSON.parse(fs.readFileSync(this.dayFile, 'utf8')) as {
      day: string;
      count: number;
    };
    return saved.day === this.day() ? saved : { day: this.day(), count: 0 };
  }

  private memoryDay = { day: '', count: 0 };

  private dayCount(): { day: string; count: number } {
    if (this.dayFile) return this.readDay();
    if (this.memoryDay.day !== this.day()) this.memoryDay = { day: this.day(), count: 0 };
    return this.memoryDay;
  }

  async acquire(): Promise<void> {
    const today = this.dayCount();
    if (today.count >= this.rpd) {
      throw new DailyBudgetExceeded(
        `Daily request budget (${this.rpd}) reached; resume tomorrow. Cached results are kept.`,
      );
    }
    for (;;) {
      const now = this.clock.now();
      this.tokens = Math.min(this.rpm, this.tokens + ((now - this.last) * this.rpm) / 60_000);
      this.last = now;
      if (this.tokens >= 1) break;
      await this.clock.sleep(Math.ceil(((1 - this.tokens) * 60_000) / this.rpm));
    }
    this.tokens -= 1;
    today.count += 1;
    if (this.dayFile) {
      fs.mkdirSync(path.dirname(this.dayFile), { recursive: true });
      fs.writeFileSync(this.dayFile, JSON.stringify(today));
    } else {
      this.memoryDay = today;
    }
  }
}
