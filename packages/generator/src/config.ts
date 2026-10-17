import { PlantedErrorType } from '@reconcile/core';
import { z } from 'zod';

/**
 * Per-set probability of planting each error type (M1 AC-12). A set that isn't clean gets at
 * least one error. Line-level errors each take a distinct line.
 */
export const Rates = z
  .object({
    cleanSetRate: z.number().min(0).max(1),
    scanRate: z.number().min(0).max(1),
    errors: z.record(PlantedErrorType, z.number().min(0).max(1)),
  })
  .strict();
export type Rates = z.infer<typeof Rates>;

export const DEFAULT_RATES: Rates = {
  cleanSetRate: 0.3,
  scanRate: 0.2,
  errors: {
    short_ship_billed_full: 0.18,
    short_ship_billed_correctly: 0.1,
    over_ship: 0.08,
    billed_not_received: 0.1,
    price_change: 0.2,
    description_typo: 0.3,
    sku_omitted: 0.12,
    extra_invoice_line: 0.08,
    missing_document: 0.08,
    duplicate_invoice: 0.08,
    price_noise: 0.15,
    vendor_name: 0.15,
  },
};

/** Merge a partial override (from a --config file or CLI flags) onto the defaults. */
export function resolveRates(override: unknown = {}): Rates {
  const partial = z
    .object({
      cleanSetRate: z.number().optional(),
      scanRate: z.number().optional(),
      errors: z.partialRecord(PlantedErrorType, z.number()).optional(),
    })
    .strict()
    .parse(override);
  return Rates.parse({
    cleanSetRate: partial.cleanSetRate ?? DEFAULT_RATES.cleanSetRate,
    scanRate: partial.scanRate ?? DEFAULT_RATES.scanRate,
    errors: { ...DEFAULT_RATES.errors, ...partial.errors },
  });
}

/** Line-level errors change a single line's qty, price, SKU, or description. */
export const LINE_ERRORS = [
  'short_ship_billed_full',
  'short_ship_billed_correctly',
  'over_ship',
  'billed_not_received',
  'price_change',
  'description_typo',
  'sku_omitted',
  'price_noise',
  'vendor_name',
] as const satisfies readonly PlantedErrorType[];

/** These only show up when all three documents can be matched, so a missing document skips them. */
export const NEEDS_COMPLETE_SET = new Set<PlantedErrorType>([
  'short_ship_billed_full',
  'short_ship_billed_correctly',
  'over_ship',
  'billed_not_received',
  'price_change',
  'extra_invoice_line',
  'duplicate_invoice',
]);
