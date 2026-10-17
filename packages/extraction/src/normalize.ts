import { Decimal } from '@reconcile/core';

/** "$1,234.56" / "1.234,00"-free / "(12.00)" -> Decimal, or null if not a number. */
export function parseMoney(raw: string | null | undefined): Decimal | null {
  if (raw === null || raw === undefined) return null;
  let s = String(raw).trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()$\s,]|USD/gi, '').replace(/^-/, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Decimal(s);
  return negative ? d.negated() : d;
}

/** Whole-cent string, e.g. "1234.50" (ADR-0004). */
export function toCentsString(d: Decimal): string {
  return d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}

/** Unit price with 2-4 decimals, e.g. "4.85" or "0.0425". */
export function toUnitPriceString(d: Decimal): string {
  const rounded = d.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
  return rounded.decimalPlaces() <= 2 ? rounded.toFixed(2) : rounded.toFixed();
}

/** Accept YYYY-MM-DD only, and only real calendar dates. */
export function parseIsoDate(raw: string | null | undefined): string | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) return null;
  const d = new Date(`${raw.trim()}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === raw.trim()
    ? raw.trim()
    : null;
}

/** Gemini-style [ymin, xmin, ymax, xmax] on 0-1000 -> our [x0, y0, x1, y1] on 0-1. */
export function convertBox(
  b: number[] | null | undefined,
): [number, number, number, number] | undefined {
  if (!b || b.length !== 4 || b.some((n) => !Number.isFinite(n))) return undefined;
  const [ymin, xmin, ymax, xmax] = b.map((n) => Math.min(1000, Math.max(0, n)) / 1000) as [
    number,
    number,
    number,
    number,
  ];
  if (!(xmin < xmax && ymin < ymax)) return undefined;
  const r = (n: number) => Math.round(n * 10000) / 10000;
  return [r(xmin), r(ymin), r(xmax), r(ymax)];
}

export const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
