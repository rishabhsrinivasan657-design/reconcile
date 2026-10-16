import { Decimal } from 'decimal.js';
import { z } from 'zod';

/** ADR-0004: money never touches JS floats. Amounts travel as strings. */
export { Decimal };

/** A whole-cent amount such as "12.50" or "-3.10". */
export const Cents = z.string().regex(/^-?\d+\.\d{2}$/, 'must be a decimal string with 2 places');

/** A unit price with up to 4 decimal places, e.g. "4.85" or "0.0425". */
export const UnitPrice = z
  .string()
  .regex(/^\d+\.\d{2,4}$/, 'must be a decimal string with 2-4 places');

/** Round half-up to cents and format, e.g. 12.345 -> "12.35". */
export function toCents(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
}
