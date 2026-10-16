# ADR-0002: LLM behind a provider interface, with a shared rate limiter and response cache

- **Status:** Proposed
- **Date:** 2026-10-16
- **Requirements:** NFR-01, NFR-03, NFR-04, FR-18

## Context
The default LLM is the Gemini free tier: low requests-per-minute and daily
caps, and the models and limits change over time. Evals re-run the same
documents many times. The owner wants to swap in Claude, OpenAI, or local
Ollama without code changes.

## Options
1. Call the Gemini SDK directly where needed. Fast to write, but locks us in,
   with no central place for limits or logging.
2. Use a multi-provider framework (e.g. LangChain, Vercel AI SDK). Broad
   support, but heavy abstraction, and we only need structured output plus images.
3. **Our own thin interface** with one adapter per provider, plus one shared
   wrapper for caching, rate limiting, retries, and logging.

## Decision
Option 3.

```ts
interface LlmProvider {
  generateStructured<T>(req: {
    purpose: 'extract' | 'fuzzy_match';
    promptVersion: string;
    model: string;
    system: string;
    user: string;
    images?: Uint8Array[];      // page images
    schema: z.ZodType<T>;       // converted to the provider's JSON schema format
  }): Promise<{ data: T; usage: { inputTokens: number; outputTokens: number } }>;
}
```

A wrapper `LlmClient` adds, in this order:
1. **Cache** keyed by `sha256(inputs) + promptVersion + provider + model`,
   stored in Postgres (it survives Redis restarts). It can be exported to
   `evals/cache/` for replay.
2. **Rate limiter:** a Redis token bucket shared by every worker process,
   with configurable RPM/RPD.
3. **Retry:** exponential backoff with jitter on 429/5xx, honoring `Retry-After`. At most 5 attempts.
4. **Validation:** Zod parse. One "repair" retry on invalid JSON.
5. **Logging:** an `LlmCall` row for every call, including cache hits and
   failures, with an estimated cost from a config price table at list price.

`LLM_PROVIDER` chooses the adapter. Model IDs come from env.

## Consequences
- ➕ Swapping providers is an env change. Evals compare providers on equal terms.
- ➕ Warm-cache evals make zero API calls.
- ➖ We maintain 4 small adapters. Anthropic and OpenAI get thinner test
  coverage, since there's no free quota.
- ➖ Changing a prompt requires bumping `promptVersion`, or stale cache entries
  are served. A unit test fails if a prompt's text hash changes without a version bump.
