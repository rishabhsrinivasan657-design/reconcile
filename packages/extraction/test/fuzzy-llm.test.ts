import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { matchDocuments, type ExtractedDocument } from '@reconcile/core';
import { LlmClient, LlmEnv, MemoryCacheStore, type Invoker } from '@reconcile/llm';
import { describe, expect, it } from 'vitest';
import { FUZZY_PROMPT, hybridFuzzyMatcher, llmFuzzyMatcher } from '../src/fuzzy-llm.ts';

const env = () =>
  LlmEnv.parse({
    LLM_PROVIDER: 'gemini',
    LLM_MODEL_EXTRACT: 'gemini-3.5-flash-lite',
    GEMINI_API_KEY: 'test',
    LLM_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'fz-')),
  });
function fakeLlm(pairs: { a: number; b: number; confidence: number; reason: string }[]) {
  const seen: string[] = [];
  const invoker: Invoker = async (_schema, _system, userText) => {
    seen.push(userText);
    return { parsed: { pairs }, usage: { inputTokens: 100, outputTokens: 50 } };
  };
  return { llm: new LlmClient({ env: env(), cache: new MemoryCacheStore(), invoker }), seen };
}
const L = (lineNo: number, description: string, sku?: string) => ({
  lineNo,
  description,
  qty: 5,
  uom: 'CS',
  ...(sku ? { sku } : {}),
});

describe('AI fuzzy matcher (M4 AC-9)', () => {
  it('returns the AI pairs with reasons, and refuses different sizes or units', async () => {
    const { llm } = fakeLlm([
      { a: 1, b: 1, confidence: 0.92, reason: 'Nut Spread is the vendor name for Almond Butter' },
      { a: 2, b: 2, confidence: 0.9, reason: 'wrong size on purpose' },
    ]);
    const out = await llmFuzzyMatcher(llm)(
      [L(1, 'Sunpeak Crunchy Almond Butter, 12 oz'), L(2, 'Sunpeak Creamy Peanut Butter, 16 oz')],
      [L(1, 'Chunky Nut Spread, Almond, 12 oz'), L(2, 'Smooth Groundnut Spread, 28 oz')],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ left: 1, right: 1, score: 0.92 });
    expect(out[0]!.reason).toMatch(/^AI: Nut Spread is the vendor name/);
  });

  it('hybrid: the text matcher pairs the easy line; the AI only sees the hard one', async () => {
    const { llm, seen } = fakeLlm([
      { a: 2, b: 1, confidence: 0.9, reason: 'Oat Drink, No Sugar Added = Unsweetened Oat Milk' },
    ]);
    // Exact napkins (1.0) stay with the text matcher; the oat line (0.76) goes to the AI.
    const out = await hybridFuzzyMatcher(llm, 0.9)(
      [L(1, 'Ashpoint White Napkins, 250 ct'), L(2, 'Brookcrest Unsweetened Oat Milk, 32 fl oz')],
      [L(1, 'No Sugar Added Oat Drink, 32 fl oz'), L(2, 'Ashpoint White Napkins, 250 ct')],
    );
    expect(out.map((c) => [c.left, c.right])).toEqual([
      [1, 2],
      [2, 1],
    ]);
    expect(seen).toHaveLength(1);
    expect(seen[0]).not.toContain('Napkins');
  });

  it('plugs into the matcher: a vendor-named line is paired by the AI with its reason', async () => {
    const { llm } = fakeLlm([
      { a: 1, b: 1, confidence: 0.95, reason: 'Chunky Nut Spread = Crunchy Almond Butter' },
    ]);
    const doc = (
      id: string,
      type: ExtractedDocument['type'],
      description: string,
      sku?: string,
      price?: string,
    ): ExtractedDocument => ({
      id,
      type,
      vendorName: 'Sunpeak Foods Co.',
      docNumber: type === 'PO' ? 'HP-PO-1' : `${type}-1`,
      ...(type === 'PO' ? {} : { poNumber: 'HP-PO-1' }),
      date: '2026-03-01',
      lines: [
        {
          lineNo: 1,
          description,
          qty: 5,
          uom: 'CS',
          ...(sku ? { sku } : {}),
          ...(price ? { unitPrice: price } : {}),
        },
      ],
    });
    const r = await matchDocuments(
      [
        doc('po', 'PO', 'Sunpeak Crunchy Almond Butter, 12 oz', 'SP-1', '5.00'),
        doc('rr', 'RR', 'Sunpeak Crunchy Almond Butter, 12 oz', 'SP-1'),
        doc('inv', 'INVOICE', 'Chunky Nut Spread, Almond, 12 oz', undefined, '5.00'),
      ],
      { fuzzy: llmFuzzyMatcher(llm) },
    );
    expect(r.groups[0]!.exceptions).toEqual([]);
    expect(r.groups[0]!.lineMatches[0]).toMatchObject({
      method: 'FUZZY',
      reason: expect.stringMatching(/^AI: Chunky Nut Spread/),
    });
  });

  it('the fuzzy prompt is locked', () => {
    const lock = JSON.parse(
      fs.readFileSync(path.join(import.meta.dirname, '../prompts.lock.json'), 'utf8'),
    ) as Record<string, string>;
    const sample = [{ lineNo: 1, description: 'X, 1 oz', qty: 1, uom: 'CS' }];
    const hash = createHash('sha256')
      .update(FUZZY_PROMPT.system + FUZZY_PROMPT.jsonShape + FUZZY_PROMPT.user(sample, sample))
      .digest('hex');
    expect(lock[FUZZY_PROMPT.version], 'fuzzy prompt changed: bump its version').toBe(hash);
  });
});
