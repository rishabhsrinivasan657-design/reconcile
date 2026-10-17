import path from 'node:path';
import { z } from 'zod';
import { BudgetExceeded, SpendLedger } from './budget.ts';
import { cacheKey, FileCacheStore, type CacheStore } from './cache.ts';
import { FREE_TIER_PROVIDERS, PROVIDER_LIMITS, type LlmEnv, type Provider } from './env.ts';
import { realClock, RateLimiter, type Clock, type Limiter } from './limiter.ts';
import { estimateCost, type Usage } from './prices.ts';
import {
  createChatModel,
  invokeStructured,
  type ImagePart,
  type InvokeResult,
} from './providers.ts';
import { statusOf, withRetry } from './retry.ts';
import { nullSink, type CallSink } from './sinks.ts';

export class ReplayMiss extends Error {
  override name = 'ReplayMiss';
}

export interface StructuredRequest<T> {
  purpose: 'EXTRACT' | 'FUZZY_MATCH';
  promptVersion: string;
  system: string;
  userText: string;
  images?: readonly ImagePart[];
  schema: z.ZodType<T>;
  /** Identifies the input, e.g. [sha256(file bytes)]. Prompt version, provider, model are added. */
  cacheKeyParts: readonly string[];
  /** Compact example of the answer's JSON shape, appended to the prompt for JSON-mode providers. */
  jsonShape?: string;
  documentRef?: string;
  maxOutputTokens?: number;
}

export interface StructuredResult<T> {
  data: T;
  usage: Usage;
  latencyMs: number;
  cacheHit: boolean;
  costUsd: number | null;
  provider: Provider;
  model: string;
  /** Number of live provider calls made (0 on a cache hit; 2 when a repair was needed). */
  liveCalls: number;
}

/** Injected in tests instead of a real LangChain model. */
export type Invoker = (
  schema: z.ZodType,
  system: string,
  userText: string,
  images: readonly ImagePart[],
) => Promise<InvokeResult>;

export interface LlmClientOptions {
  env: LlmEnv;
  provider?: Provider;
  model?: string;
  cache?: CacheStore;
  sink?: CallSink;
  /** 'live': cache first, then provider. 'replay': cache only; a miss throws (CI). */
  mode?: 'live' | 'replay';
  clock?: Clock;
  invoker?: Invoker;
  baseUrl?: string;
  /** Folder for the day counter and spend ledger; defaults to LLM_CACHE_DIR. */
  stateDir?: string;
  /** Share one rate limit across processes (the worker passes a Redis limiter). */
  limiter?: Limiter;
}

const DEFAULT_MAX_OUTPUT = 8000;
/** Typical answer size, used to reserve tokens-per-minute before a call. */
const EXPECTED_OUTPUT_TOKENS = 3000;

/**
 * Structured LLM calls with cache, budget guard, rate limit, retry, one repair, and call log
 * (ADR-0002, ADR-0010, M3 AC-1..AC-4b).
 */
export class LlmClient {
  readonly provider: Provider;
  readonly model: string;
  private readonly cache: CacheStore;
  private readonly sink: CallSink;
  private readonly mode: 'live' | 'replay';
  private readonly clock: Clock;
  private readonly limiter: Limiter;
  private readonly ledger: SpendLedger;
  private invoker: Invoker | undefined;

  constructor(private readonly opts: LlmClientOptions) {
    const { env } = opts;
    this.provider = opts.provider ?? env.LLM_PROVIDER;
    this.model = opts.model ?? env.LLM_MODEL_EXTRACT;
    this.cache = opts.cache ?? new FileCacheStore(env.LLM_CACHE_DIR);
    this.sink = opts.sink ?? nullSink;
    this.mode = opts.mode ?? 'live';
    this.clock = opts.clock ?? realClock;
    const stateDir = opts.stateDir ?? env.LLM_CACHE_DIR;
    const caps = PROVIDER_LIMITS[this.provider];
    const tpm = env.LLM_TPM ?? caps.tpm;
    const tpd = env.LLM_TPD ?? caps.tpd;
    this.limiter =
      opts.limiter ??
      new RateLimiter(
        {
          rpm: env.LLM_RPM ?? caps.rpm,
          rpd: env.LLM_RPD ?? caps.rpd,
          ...(tpm ? { tpm } : {}),
          ...(tpd ? { tpd } : {}),
        },
        path.join(stateDir, `_limits-${this.provider}.json`),
        this.clock,
      );
    this.ledger = new SpendLedger(env.LLM_BUDGET_USD, path.join(stateDir, '_spend.json'));
    this.invoker = opts.invoker;
  }

  spentUsd(): number {
    return this.ledger.spent();
  }

  private getInvoker(maxOutputTokens: number): Invoker {
    if (this.invoker) return this.invoker;
    const chat = createChatModel({
      provider: this.provider,
      model: this.model,
      env: this.opts.env,
      maxOutputTokens,
      ...(this.opts.baseUrl ? { baseUrl: this.opts.baseUrl } : {}),
    });
    const jsonMode = PROVIDER_LIMITS[this.provider].jsonMode;
    this.invoker = (schema, system, userText, images) =>
      invokeStructured(chat, schema, system, userText, images, jsonMode);
    return this.invoker;
  }

  private estimateInputTokens(req: StructuredRequest<unknown>, userText: string): number {
    return (
      Math.ceil((this.systemPrompt(req).length + userText.length) / 3) +
      (req.images?.length ?? 0) * PROVIDER_LIMITS[this.provider].imageTokens
    );
  }

  /** JSON-mode providers (Groq) need the expected shape spelled out in the prompt. */
  private systemPrompt(req: StructuredRequest<unknown>): string {
    return PROVIDER_LIMITS[this.provider].jsonMode && req.jsonShape
      ? `${req.system}\n\nRespond with ONE JSON object only, shaped exactly like this (types shown as values):\n${req.jsonShape}`
      : req.system;
  }

  private worstCaseUsd(
    req: StructuredRequest<unknown>,
    userText: string,
    maxOutput: number,
  ): number {
    if (FREE_TIER_PROVIDERS.has(this.provider)) return 0;
    const inputTokens = this.estimateInputTokens(req, userText);
    const cost = estimateCost(this.model, { inputTokens, outputTokens: maxOutput });
    if (cost === null) {
      throw new BudgetExceeded(
        `No list price known for model "${this.model}", so spend can't be capped. Add it to packages/llm/src/prices.ts.`,
      );
    }
    return cost;
  }

  /** One live call through budget check, rate limit, and retry. */
  private async live(req: StructuredRequest<unknown>, userText: string, maxOutput: number) {
    const images = req.images ?? [];
    const maxImages = PROVIDER_LIMITS[this.provider].maxImages;
    if (images.length > maxImages) {
      throw new Error(
        `${this.provider} accepts at most ${maxImages} images per request; this document has ${images.length} pages.`,
      );
    }
    this.ledger.check(this.worstCaseUsd(req, userText, maxOutput));
    const estTokens =
      this.estimateInputTokens(req, userText) + Math.min(maxOutput, EXPECTED_OUTPUT_TOKENS);
    await this.limiter.acquire(estTokens);
    const invoke = this.getInvoker(maxOutput);
    const system = this.systemPrompt(req);
    const t0 = this.clock.now();
    const pendingLogs: Promise<void>[] = [];
    const run = withRetry(() => invoke(req.schema, system, userText, images), {
      clock: this.clock,
      onAttempt: ({ error, status }) => {
        if (!error) return;
        const logged = this.sink.record({
          provider: this.provider,
          model: this.model,
          promptVersion: req.promptVersion,
          purpose: req.purpose,
          ...(req.documentRef ? { documentRef: req.documentRef } : {}),
          latencyMs: this.clock.now() - t0,
          inputTokens: 0,
          outputTokens: 0,
          cacheHit: false,
          costUsd: null,
          error: `${status ?? ''} ${String((error as Error).message ?? error)}`
            .trim()
            .slice(0, 300),
        });
        pendingLogs.push(Promise.resolve(logged));
      },
    });
    // Failed attempts are logged before the error propagates, so a caller that closes its
    // database right after a failure doesn't lose the log rows.
    const result = await run
      .catch(async (e: unknown) => {
        await this.limiter.settle(estTokens, estTokens);
        throw e;
      })
      .finally(() => Promise.allSettled(pendingLogs));
    await this.limiter.settle(estTokens, result.usage.inputTokens + result.usage.outputTokens);
    const latencyMs = this.clock.now() - t0;
    // Free tiers never bill; list prices (when known) are still reported for comparison.
    const costUsd = estimateCost(this.model, result.usage);
    if (!FREE_TIER_PROVIDERS.has(this.provider)) this.ledger.add(costUsd ?? 0);
    return { ...result, latencyMs, costUsd };
  }

  async generateStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    // Generation settings change answers, so they're part of the key too.
    const key = cacheKey([
      ...req.cacheKeyParts,
      req.promptVersion,
      this.provider,
      this.model,
      `effort=${this.opts.env.LLM_REASONING_EFFORT}`,
    ]);
    const base = {
      provider: this.provider,
      model: this.model,
      promptVersion: req.promptVersion,
      purpose: req.purpose,
      ...(req.documentRef ? { documentRef: req.documentRef } : {}),
    };

    const hit = this.cache.get(key);
    if (hit) {
      const data = req.schema.parse(hit.data);
      await this.sink.record({
        ...base,
        latencyMs: hit.latencyMs,
        ...hitUsage(hit.usage),
        cacheHit: true,
        costUsd: hit.costUsd,
      });
      return {
        data,
        usage: hit.usage,
        latencyMs: hit.latencyMs,
        cacheHit: true,
        costUsd: hit.costUsd,
        provider: this.provider,
        model: this.model,
        liveCalls: 0,
      };
    }
    if (this.mode === 'replay') {
      throw new ReplayMiss(
        `No recorded response for ${req.documentRef ?? key} (${req.promptVersion}, ${this.provider}/${this.model}). ` +
          'The prompt, model, or document changed: re-record with `pnpm eval:record`.',
      );
    }

    const maxOutput = req.maxOutputTokens ?? DEFAULT_MAX_OUTPUT;
    let first = await this.live(req, req.userText, maxOutput);
    let usage = first.usage;
    let latencyMs = first.latencyMs;
    let costUsd = first.costUsd;
    let liveCalls = 1;
    let parsed = req.schema.safeParse(first.parsed);
    if (!parsed.success) {
      // One repair attempt: show the model its validation errors (ADR-0002).
      const repairText = `${req.userText}\n\nYour previous answer did not match the required schema:\n${z.prettifyError(parsed.error).slice(0, 2000)}\nReturn a corrected answer.`;
      first = await this.live(req, repairText, maxOutput);
      liveCalls = 2;
      usage = {
        inputTokens: usage.inputTokens + first.usage.inputTokens,
        outputTokens: usage.outputTokens + first.usage.outputTokens,
      };
      latencyMs += first.latencyMs;
      costUsd = costUsd === null || first.costUsd === null ? null : costUsd + first.costUsd;
      parsed = req.schema.safeParse(first.parsed);
    }
    await this.sink.record({
      ...base,
      latencyMs,
      ...hitUsage(usage),
      cacheHit: false,
      costUsd,
      ...(parsed.success ? {} : { error: 'schema validation failed after repair' }),
    });
    if (!parsed.success) {
      throw new Error(
        `LLM answer failed validation after one repair: ${z.prettifyError(parsed.error).slice(0, 300)}` +
          (first.rawPreview ? ` | raw answer: ${first.rawPreview}` : ''),
      );
    }
    this.cache.set(key, {
      keyParts: [...req.cacheKeyParts],
      provider: this.provider,
      model: this.model,
      promptVersion: req.promptVersion,
      data: parsed.data,
      usage,
      latencyMs,
      costUsd,
    });
    return {
      data: parsed.data,
      usage,
      latencyMs,
      cacheHit: false,
      costUsd,
      provider: this.provider,
      model: this.model,
      liveCalls,
    };
  }
}

const hitUsage = (u: Usage) => ({ inputTokens: u.inputTokens, outputTokens: u.outputTokens });

export { statusOf };
