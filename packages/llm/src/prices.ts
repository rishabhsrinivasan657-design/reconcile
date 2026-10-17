/**
 * List prices in USD per 1M tokens, used for cost estimates and the budget guard.
 * Checked 2026-10-17 on the providers' pricing pages. Unknown models return null (never a guess).
 */
export const PRICES_CHECKED = '2026-10-17';

export const PRICES: Record<string, { input: number; output: number }> = {
  // OpenAI (developers.openai.com/api/docs/pricing)
  'gpt-6-luna': { input: 0.1, output: 0.5 },
  'gpt-5-mini': { input: 0.25, output: 2.0 },
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4.1-mini': { input: 0.4, output: 1.6 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
  // Gemini (ai.google.dev/gemini-api/docs/pricing); free tier costs $0, these are list prices
  'gemini-3.8-flash': { input: 0.75, output: 3.75 },
  'gemini-3.5-flash-lite': { input: 0.3, output: 2.5 },
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4 },
};

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export function estimateCost(model: string, usage: Usage): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return (usage.inputTokens * p.input + usage.outputTokens * p.output) / 1_000_000;
}
