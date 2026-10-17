import { z } from 'zod';

/** Matching settings (M2 AC-5). Money values are decimal strings (ADR-0004). */
export const MatchConfig = z.object({
  /** Quantities count as equal when |a - b| <= max(abs, pct x ordered). Default: exact. */
  qtyTolerance: z.object({ abs: z.number().min(0), pct: z.number().min(0) }),
  /** Prices count as equal when |pInv - pPo| <= max(abs, pct x pPo). */
  priceTolerance: z.object({ abs: z.string(), pct: z.string() }),
  /** Same vendor + same total within this many days counts as a duplicate invoice. */
  duplicateWindowDays: z.int().min(0),
  /** Minimum fuzzy score (0-1) to accept a description-only pairing. */
  fuzzyThreshold: z.number().min(0).max(1),
});
export type MatchConfig = z.infer<typeof MatchConfig>;

export const DEFAULT_MATCH_CONFIG: MatchConfig = {
  qtyTolerance: { abs: 0, pct: 0 },
  priceTolerance: { abs: '0.01', pct: '0.005' },
  duplicateWindowDays: 45,
  fuzzyThreshold: 0.75,
};

export function resolveMatchConfig(partial: Partial<MatchConfig> = {}): MatchConfig {
  return MatchConfig.parse({ ...DEFAULT_MATCH_CONFIG, ...partial });
}
