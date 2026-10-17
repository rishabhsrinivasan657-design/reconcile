import fs from 'node:fs';
import path from 'node:path';

export class BudgetExceeded extends Error {
  override name = 'BudgetExceeded';
}

/**
 * Hard cap on estimated live spend (M3 AC-4b). The ledger persists on disk; a call is refused
 * *before* it is sent if its worst-case estimate would cross the cap.
 */
export class SpendLedger {
  private memory = 0;

  constructor(
    readonly capUsd: number,
    private readonly file: string | undefined,
  ) {}

  spent(): number {
    if (!this.file) return this.memory;
    return fs.existsSync(this.file)
      ? (JSON.parse(fs.readFileSync(this.file, 'utf8')) as { spentUsd: number }).spentUsd
      : 0;
  }

  check(worstCaseUsd: number): void {
    const spent = this.spent();
    if (spent + worstCaseUsd > this.capUsd) {
      throw new BudgetExceeded(
        `LLM budget cap reached: $${spent.toFixed(4)} spent of $${this.capUsd.toFixed(2)} ` +
          `(next call could cost up to $${worstCaseUsd.toFixed(4)}). Raise LLM_BUDGET_USD to continue. ` +
          'Cached and replayed results still work.',
      );
    }
  }

  add(usd: number): void {
    const total = this.spent() + usd;
    if (!this.file) {
      this.memory = total;
      return;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify({ spentUsd: total }, null, 2));
  }
}
