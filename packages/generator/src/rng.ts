import { uniformInt } from 'pure-rand/distribution/uniformInt';
import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import type { RandomGenerator } from 'pure-rand/types/RandomGenerator';

/** 32-bit FNV-1a hash, used to derive child seeds from labels. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Seeded random source: the only randomness the generator may use (ADR-0006).
 * `fork(label)` gives an independent stream, so adding a set or a document doesn't shift others.
 */
export class Rng {
  readonly seed: number;
  private readonly gen: RandomGenerator;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.gen = xoroshiro128plus(this.seed);
  }

  fork(label: string): Rng {
    return new Rng(fnv1a(`${this.seed}:${label}`));
  }

  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number {
    return uniformInt(this.gen, min, max);
  }

  /** Float in [0, 1) with 1e-6 resolution: plenty for rates and jitter. */
  float(): number {
    return this.int(0, 999_999) / 1_000_000;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.float();
  }

  chance(probability: number): boolean {
    return this.float() < probability;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('pick from empty list');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Pick by relative weight. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T {
    const total = entries.reduce((sum, [, w]) => sum + w, 0);
    let roll = this.float() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1]![0];
  }

  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j]!, out[i]!];
    }
    return out;
  }

  sample<T>(items: readonly T[], count: number): T[] {
    return this.shuffle(items).slice(0, count);
  }
}
