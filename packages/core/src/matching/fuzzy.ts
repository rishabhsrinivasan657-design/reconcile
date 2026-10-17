import type { FuzzyCandidate, FuzzyLine, FuzzyMatcher } from './types.ts';

/**
 * Baseline fuzzy matcher (ADR-0009): classic string similarity, no AI, no dependencies.
 * Deliberately generic: it knows nothing about the synthetic generator's abbreviation list.
 */

const UNIT_ALIASES: Record<string, string> = { fz: 'floz', ct: 'ct', pk: 'pk', lbs: 'lb' };

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bfl\.?\s*oz\b/g, 'floz')
    .replace(/(\d)([a-z])/g, '$1 $2')
    .replace(/([a-z])(\d)/g, '$1 $2')
    .replace(/[^a-z0-9.\s]/g, ' ')
    .replace(/(?<!\d)\.|\.(?!\d)/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => UNIT_ALIASES[t] ?? t);
}

const isNumber = (t: string) => /^\d+(\.\d+)?$/.test(t);

export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1;
  if (!a.length || !b.length) return 0;
  const window = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
  const aHit = new Array<boolean>(a.length).fill(false);
  const bHit = new Array<boolean>(b.length).fill(false);
  let matches = 0;
  for (let i = 0; i < a.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(b.length, i + window + 1); j++) {
      if (!bHit[j] && a[i] === b[j]) {
        aHit[i] = bHit[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  let transpositions = 0;
  for (let i = 0; i < a.length; i++) {
    if (!aHit[i]) continue;
    while (!bHit[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }
  const m = matches;
  const jaro = (m / a.length + m / b.length + (m - transpositions / 2) / m) / 3;
  let prefix = 0;
  while (prefix < 4 && a[prefix] === b[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** "btr" in "butter", "org" in "organic": same first letter, letters in order. */
function abbreviationScore(a: string, b: string): number {
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  if (s.length < 2 || s[0] !== l[0]) return 0;
  let i = 0;
  for (const ch of l) if (ch === s[i]) i++;
  return i === s.length ? 0.85 + 0.1 * (s.length / l.length) : 0;
}

export function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const na = isNumber(a);
  const nb = isNumber(b);
  if (na || nb) return na && nb && Number(a) === Number(b) ? 1 : 0;
  return Math.max(jaroWinkler(a, b), abbreviationScore(a, b));
}

/** Directed Monge-Elkan: each token's best match on the other side, averaged. */
function mongeElkan(
  a: string[],
  b: string[],
): { score: number; pairs: [string, string, number][] } {
  const pairs: [string, string, number][] = [];
  let sum = 0;
  for (const ta of a) {
    let best = 0;
    let bestTok = '';
    for (const tb of b) {
      const s = tokenSimilarity(ta, tb);
      if (s > best) [best, bestTok] = [s, tb];
    }
    sum += best;
    pairs.push([ta, bestTok, best]);
  }
  return { score: a.length ? sum / a.length : 0, pairs };
}

export function descriptionSimilarity(a: string, b: string): { score: number; reason: string } {
  const ta = tokenize(a);
  const tb = tokenize(b);
  const ab = mongeElkan(ta, tb);
  const ba = mongeElkan(tb, ta);
  let score = (ab.score + ba.score) / 2;
  const numsA = ta.filter(isNumber).map(Number).sort();
  const numsB = tb.filter(isNumber).map(Number).sort();
  const sizesMatch = numsA.join() === numsB.join();
  if (!sizesMatch) score *= 0.5; // a different size is a different product
  const fuzzyHits = ab.pairs
    .filter(([x, y, s]) => x !== y && s >= 0.8)
    .map(([x, y]) => `"${x}"≈"${y}"`)
    .slice(0, 4);
  const reason =
    `text ${score.toFixed(2)}` +
    (fuzzyHits.length ? `: ${fuzzyHits.join(', ')}` : '') +
    (sizesMatch ? (numsA.length ? `; sizes match (${numsA.join(', ')})` : '') : '; sizes differ');
  return { score, reason };
}

/** Default FuzzyMatcher: scores every same-UOM pair; the pipeline assigns one-to-one. */
export const textSimilarityMatcher: FuzzyMatcher = (left: FuzzyLine[], right: FuzzyLine[]) => {
  const out: FuzzyCandidate[] = [];
  for (const l of left) {
    for (const r of right) {
      if (l.uom.toUpperCase() !== r.uom.toUpperCase()) continue;
      const { score, reason } = descriptionSimilarity(l.description, r.description);
      out.push({ left: l.lineNo, right: r.lineNo, score, reason });
    }
  }
  return out;
};
