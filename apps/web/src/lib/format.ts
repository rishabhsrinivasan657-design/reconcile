/**
 * Number formatting for the screen (style guide: Numbers and money). The API sends money as exact
 * decimal strings; we only format them, never do arithmetic with JavaScript numbers.
 */

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** "1284.5" → "$1,284.50"; "-3" → "−$3.00". */
export function money(amount: string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const { sign, whole, cents } = parts(amount);
  return `${sign}$${whole}.${cents}`;
}

/** The pieces of a money string, for headline figures that set the cents smaller. */
export function parts(amount: string): { sign: string; whole: string; cents: string } {
  const neg = amount.trim().startsWith('-');
  const [w = '0', f = ''] = amount.trim().replace(/^[-+]/, '').split('.');
  return {
    sign: neg ? '−' : '',
    whole: group(w.replace(/^0+(?=\d)/, '')),
    cents: (f + '00').slice(0, 2),
  };
}

/** Unit prices keep up to 4 decimals but at least 2: "4.8" → "$4.80", "0.0425" → "$0.0425". */
export function unitPrice(p: string | null | undefined): string {
  if (!p) return '—';
  const [w = '0', f = ''] = p.split('.');
  const dec = f.length <= 2 ? (f + '00').slice(0, 2) : f.replace(/0+$/, '').padEnd(2, '0');
  return `$${group(w)}.${dec}`;
}

/**
 * Difference between two decimal strings, exactly (scaled integers), as "+$0.40" / "−$1.25".
 * Used for "+$3.90 / case" under a price that differs.
 */
export function difference(a: string, b: string): string {
  const scale = (s: string) => {
    const [w = '0', f = ''] = s.split('.');
    return BigInt(w + (f + '0000').slice(0, 4)) * (s.startsWith('-') ? -1n : 1n);
  };
  const d = scale(b) - scale(a);
  const abs = d < 0n ? -d : d;
  const whole = abs / 10000n;
  const frac = (abs % 10000n)
    .toString()
    .padStart(4, '0')
    .replace(/0{1,2}$/, '');
  return `${d < 0n ? '−' : '+'}$${group(whole.toString())}.${frac.length < 2 ? frac.padEnd(2, '0') : frac}`;
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});
const TIME = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' });

/** "Mar 4, 2026" (tables). Accepts ISO dates or timestamps. */
export const date = (iso: string) =>
  DATE.format(new Date(iso.length === 10 ? `${iso}T12:00:00` : iso));
/** "Mar 4, 2026, 2:15 PM" (history). */
export const dateTime = (iso: string) => DATE_TIME.format(new Date(iso));

/** "2:15 PM" today, "Yesterday", or a date. */
export function when(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const days = Math.floor(
    (new Date(now.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000,
  );
  if (days <= 0) return TIME.format(d);
  if (days === 1) return 'Yesterday';
  return DATE.format(d);
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
