/**
 * Formatting for tool answers (M6 AC-4, AC-7, AC-8). Money comes from the API as exact decimal
 * strings and is only formatted here, never computed with floating-point numbers (ADR-0004).
 */

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "1284.5" → "$1,284.50". */
export function money(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return 'unknown';
  const neg = amount.trim().startsWith('-');
  const [w = '0', f = ''] = amount.trim().replace(/^[-+]/, '').split('.');
  return `${neg ? '−' : ''}$${group(w.replace(/^0+(?=\d)/, ''))}.${(f + '00').slice(0, 2)}`;
}

/** Add decimal strings exactly, via whole cents. */
export function sumMoney(amounts: string[]): string {
  const cents = amounts.reduce((c, a) => {
    const neg = a.startsWith('-');
    const [w = '0', f = ''] = a.replace(/^[-+]/, '').split('.');
    const v = BigInt(w) * 100n + BigInt((f + '00').slice(0, 2));
    return c + (neg ? -v : v);
  }, 0n);
  const abs = cents < 0n ? -cents : cents;
  return `${cents < 0n ? '-' : ''}${abs / 100n}.${(abs % 100n).toString().padStart(2, '0')}`;
}

/**
 * Text that came from an uploaded document (vendor names, line descriptions, notes). A stranger
 * could have written it, so it's always shown inside «…», with the quote marks and line breaks
 * inside it removed so it can't "break out" of the quote (M6 AC-7).
 */
export function quote(text: string | null | undefined, max = 240): string {
  if (text === null || text === undefined) return '«»';
  const clean = text
    .replace(/[«»]/g, '')
    .replace(/[\r\n\t\u2028\u2029]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return `«${clean.length > max ? `${clean.slice(0, max - 1)}…` : clean}»`;
}

/** "showing 25 of 60; narrow it with …" (M6 AC-8). */
export function showing(shown: number, total: number, narrowWith: string): string {
  return shown < total ? ` Showing ${shown} of ${total}; narrow it with ${narrowWith}.` : '';
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export const PROBLEM_WORDS: Record<string, string> = {
  DUPLICATE_INVOICE: 'duplicate invoice',
  MISSING_DOCUMENT: 'missing document',
  PRICE_VARIANCE: 'price over PO',
  QTY_BILLED_NOT_RECEIVED: 'billed, not received',
  OVER_SHIP: 'over-shipped',
  UNMATCHED_LINE: 'line not on PO',
  SHORT_SHIP: 'short-shipped',
};
export const problemWords = (t: string) => PROBLEM_WORDS[t] ?? t;

export const STATUS_WORDS: Record<string, string> = {
  OPEN: 'open',
  APPROVED: 'approved',
  DISPUTED: 'disputed',
  WRITTEN_OFF: 'written off',
  MATCHED: 'matched',
  WAITING: 'waiting for documents',
  NEEDS_REVIEW: 'needs review',
};
export const statusWords = (s: string) => STATUS_WORDS[s] ?? s.toLowerCase();

export const DECISION_WORDS: Record<string, string> = {
  APPROVE: 'approved',
  DISPUTE: 'disputed',
  WRITE_OFF: 'written off',
};

/** The person's name without the role in brackets: "Alex Rivera (AP)" → "Alex Rivera". */
export const person = (name: string | null | undefined) =>
  (name ?? 'someone').replace(/\s*\(.*\)$/, '');
