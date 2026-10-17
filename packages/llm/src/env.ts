import { loadEnv } from '@reconcile/core';
import { z } from 'zod';

export const PROVIDERS = ['groq', 'openai', 'gemini', 'anthropic', 'ollama'] as const;
export type Provider = (typeof PROVIDERS)[number];

const num = (fallback: number) => z.coerce.number().positive().default(fallback);

/** Every LLM setting comes from env (CLAUDE.md constraint 2). Keys are optional until used. */
export const LlmEnv = z.object({
  LLM_PROVIDER: z.enum(PROVIDERS).default('groq'),
  LLM_MODEL_EXTRACT: z.string().min(1).default('qwen/qwen3.8-27b'),
  LLM_REASONING_EFFORT: z.enum(['minimal', 'low', 'medium', 'high']).default('low'),
  GROQ_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  LLM_RPM: num(30),
  LLM_RPD: num(1000),
  /** Tokens per minute / per day. Default per provider (Groq free tier: 8K / 200K). */
  LLM_TPM: z.coerce.number().positive().optional(),
  LLM_TPD: z.coerce.number().positive().optional(),
  /** Hard cap on estimated live spend, in USD (M3 AC-4b). */
  LLM_BUDGET_USD: num(4),
  LLM_CACHE_DIR: z.string().min(1).default('.cache/llm'),
});
export type LlmEnv = z.infer<typeof LlmEnv>;

export const loadLlmEnv = (source: Record<string, string | undefined> = process.env) =>
  loadEnv(LlmEnv, source);

/** Which API-key variables were already set by the shell, before any .env file is loaded. */
export const snapshotShellKeys = (): Set<string> =>
  new Set(
    ['GROQ_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY'].filter(
      (k) => process.env[k],
    ),
  );

/**
 * Where the provider's key comes from. A shell variable silently overrides .env, which once
 * made the same command use different keys depending on who ran it, so we always say which.
 */
export function describeKeySource(provider: Provider, shellKeys: Set<string>): string {
  const name = KEY_ENV[provider];
  if (!name) return 'no key needed';
  if (!process.env[name]) return `${name} not set`;
  return shellKeys.has(name)
    ? `${name} from the shell environment (overrides .env)`
    : `${name} from .env`;
}

export const KEY_ENV: Record<Provider, keyof LlmEnv | undefined> = {
  groq: 'GROQ_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  ollama: undefined,
};

/** Providers whose free plan never bills: no spend cap needed (cost is reported as unknown). */
export const FREE_TIER_PROVIDERS = new Set<Provider>(['groq', 'ollama']);

/** Provider limits that matter for page images (Groq vision: 3 images, 2,048 tokens each). */
export const PROVIDER_LIMITS: Record<
  Provider,
  { maxImages: number; imageTokens: number; tpm?: number; tpd?: number; jsonMode: boolean }
> = {
  groq: { maxImages: 3, imageTokens: 2048, tpm: 8000, tpd: 200_000, jsonMode: true },
  openai: { maxImages: 20, imageTokens: 1600, jsonMode: false },
  gemini: { maxImages: 20, imageTokens: 1300, jsonMode: false },
  anthropic: { maxImages: 20, imageTokens: 1600, jsonMode: false },
  ollama: { maxImages: 4, imageTokens: 1000, jsonMode: false },
};
