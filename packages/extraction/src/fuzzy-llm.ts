import { createHash } from 'node:crypto';
import {
  textSimilarityMatcher,
  type FuzzyCandidate,
  type FuzzyLine,
  type FuzzyMatcher,
} from '@reconcile/core';
import type { LlmClient } from '@reconcile/llm';
import { z } from 'zod';

/**
 * AI pairing for lines the rules couldn't pair (M4 AC-9, FR-08). Versioned and hash-locked like
 * the extraction prompt; every pair must come with a reason (NFR-10).
 */
export const FUZZY_PROMPT = {
  version: 'fuzzy.v1',
  system: `You help an accounts-payable clerk match line items between two business documents from the same supplier: list A (the purchase order) and list B (the invoice or receiving report).

Pair each A line with the B line that is the SAME product, or leave it unpaired.
- The B side may use the supplier's own wording, abbreviations, or typos (e.g. "Chunky Nut Spread, Almond" = "Crunchy Almond Butter"; "Kitchen Roll" = "Paper Towels"; "Smooth" = "Creamy").
- Same product means same item AND same size/pack and unit. A 12 oz item never pairs with a 16 oz item.
- Quantities may differ (short or over shipments); do not use quantity to reject a pair.
- Each line is used at most once. If unsure, leave it unpaired.
- For every pair give a confidence from 0 to 1 and a short reason a clerk would understand.`,
  jsonShape: `{"pairs":[{"a":1,"b":3,"confidence":0.95,"reason":"short explanation"}]}  (a and b are the line numbers shown)`,
  user: (left: readonly FuzzyLine[], right: readonly FuzzyLine[]) =>
    `List A (purchase order):\n${left.map(line).join('\n')}\n\nList B (other document):\n${right.map(line).join('\n')}`,
} as const;

function line(l: FuzzyLine): string {
  return `${l.lineNo}. ${l.description} | unit ${l.uom} | qty ${l.qty}${l.sku ? ` | SKU ${l.sku}` : ''}`;
}

const num = z.preprocess(
  (x) => (typeof x === 'string' && x.trim() !== '' ? Number(x) : x),
  z.number(),
);
const FuzzyAnswer = z.object({
  pairs: z
    .array(
      z.object({
        a: num,
        b: num,
        confidence: num.catch(0.5),
        reason: z.string().catch(''),
      }),
    )
    .catch([]),
});

/** Size/pack numbers in a description ("12 oz", "8-pk", "250 ct"): different numbers, different product. */
const sizeNumbers = (s: string) =>
  (s.match(/\d+(?:\.\d+)?/g) ?? [])
    .map(Number)
    .sort((x, y) => x - y)
    .join(',');

export function llmFuzzyMatcher(llm: LlmClient): FuzzyMatcher {
  return async (left, right) => {
    if (left.length === 0 || right.length === 0) return [];
    const userText = FUZZY_PROMPT.user(left, right);
    const res = await llm.generateStructured({
      purpose: 'FUZZY_MATCH',
      promptVersion: FUZZY_PROMPT.version,
      system: FUZZY_PROMPT.system,
      userText,
      schema: FuzzyAnswer,
      jsonShape: FUZZY_PROMPT.jsonShape,
      cacheKeyParts: [createHash('sha256').update(userText).digest('hex')],
      maxOutputTokens: 4000,
    });
    const out: FuzzyCandidate[] = [];
    for (const p of res.data.pairs) {
      const a = left.find((l) => l.lineNo === p.a);
      const b = right.find((l) => l.lineNo === p.b);
      // Guard rails the model must not break: real lines, same unit, same size numbers.
      if (!a || !b || a.uom.toUpperCase() !== b.uom.toUpperCase()) continue;
      if (sizeNumbers(a.description) !== sizeNumbers(b.description)) continue;
      out.push({
        left: a.lineNo,
        right: b.lineNo,
        score: Math.min(1, Math.max(0, p.confidence)),
        reason: `AI: ${p.reason || 'same product'} (confidence ${p.confidence.toFixed(2)})`,
      });
    }
    return out;
  };
}

/**
 * Text matcher first; the AI only sees the lines the text matcher couldn't pair confidently.
 * Cheaper than AI-only, and keeps the deterministic pairs deterministic.
 */
export function hybridFuzzyMatcher(llm: LlmClient, threshold = 0.75): FuzzyMatcher {
  const ai = llmFuzzyMatcher(llm);
  return async (left, right) => {
    const text = (await textSimilarityMatcher(left, right))
      .filter((c) => c.score >= threshold)
      .sort((x, y) => y.score - x.score);
    const usedL = new Set<number>();
    const usedR = new Set<number>();
    const kept: FuzzyCandidate[] = [];
    for (const c of text) {
      if (usedL.has(c.left) || usedR.has(c.right)) continue;
      usedL.add(c.left);
      usedR.add(c.right);
      kept.push(c);
    }
    const restL = left.filter((l) => !usedL.has(l.lineNo));
    const restR = right.filter((l) => !usedR.has(l.lineNo));
    return [...kept, ...(await ai(restL, restR))];
  };
}

export type FuzzyStrategy = 'text' | 'llm' | 'hybrid';

export function fuzzyFor(strategy: FuzzyStrategy, llm?: LlmClient): FuzzyMatcher | undefined {
  if (strategy === 'text') return undefined;
  if (!llm) throw new Error(`Fuzzy strategy "${strategy}" needs an LLM client`);
  return strategy === 'llm' ? llmFuzzyMatcher(llm) : hybridFuzzyMatcher(llm);
}
