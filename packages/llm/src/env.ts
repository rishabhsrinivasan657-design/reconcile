import { loadEnv } from '@reconcile/core';
import { z } from 'zod';

export const PROVIDERS = ['openai', 'gemini', 'anthropic', 'ollama'] as const;
export type Provider = (typeof PROVIDERS)[number];

const num = (fallback: number) => z.coerce.number().positive().default(fallback);

/** Every LLM setting comes from env (CLAUDE.md constraint 2). Keys are optional until used. */
export const LlmEnv = z.object({
  LLM_PROVIDER: z.enum(PROVIDERS).default('openai'),
  LLM_MODEL_EXTRACT: z.string().min(1).default('gpt-6-luna'),
  LLM_REASONING_EFFORT: z.enum(['minimal', 'low', 'medium', 'high']).default('low'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OLLAMA_BASE_URL: z.string().url().default('http://localhost:11434'),
  LLM_RPM: num(30),
  LLM_RPD: num(1000),
  /** Hard cap on estimated live spend, in USD (M3 AC-4b). */
  LLM_BUDGET_USD: num(4),
  LLM_CACHE_DIR: z.string().min(1).default('.cache/llm'),
});
export type LlmEnv = z.infer<typeof LlmEnv>;

export const loadLlmEnv = (source: Record<string, string | undefined> = process.env) =>
  loadEnv(LlmEnv, source);

/** Which API-key variables were already set by the shell, before any .env file is loaded. */
export const snapshotShellKeys = (): Set<string> =>
  new Set(['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY'].filter((k) => process.env[k]));

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
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  ollama: undefined,
};
