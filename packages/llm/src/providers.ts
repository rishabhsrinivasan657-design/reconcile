/**
 * The only file that imports LangChain (ADR-0010). It turns a provider name into a chat model
 * and runs one structured, multimodal call. Everything around it (cache, limits, budget, log)
 * is ours.
 */
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatGroq } from '@langchain/groq';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import type { z } from 'zod';
import type { LlmEnv, Provider } from './env.ts';
import type { Usage } from './prices.ts';

export interface ModelOptions {
  provider: Provider;
  model: string;
  env: LlmEnv;
  maxOutputTokens: number;
  /** Override the provider's base URL (tests point this at a local mock server). */
  baseUrl?: string;
}

const GEMINI_THINKING = { minimal: 'LOW', low: 'LOW', medium: 'MEDIUM', high: 'HIGH' } as const;

function requireKey(value: string | undefined, name: string): string {
  if (!value)
    throw new Error(`${name} is not set. Add it to your .env (never paste keys in chat).`);
  return value;
}

export function createChatModel(o: ModelOptions): BaseChatModel {
  // LangChain's own retries are off: our retry layer owns them so every attempt is logged.
  const common = { model: o.model, maxRetries: 0 };
  switch (o.provider) {
    case 'groq':
      return new ChatGroq({
        ...common,
        apiKey: requireKey(o.env.GROQ_API_KEY, 'GROQ_API_KEY'),
        maxTokens: o.maxOutputTokens,
        temperature: 0,
        ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}),
      });
    case 'openai':
      return new ChatOpenAI({
        ...common,
        apiKey: requireKey(o.env.OPENAI_API_KEY, 'OPENAI_API_KEY'),
        maxCompletionTokens: o.maxOutputTokens,
        reasoning: { effort: o.env.LLM_REASONING_EFFORT },
        ...(o.baseUrl ? { configuration: { baseURL: o.baseUrl } } : {}),
      });
    case 'gemini':
      return new ChatGoogleGenerativeAI({
        ...common,
        apiKey: requireKey(o.env.GEMINI_API_KEY, 'GEMINI_API_KEY'),
        maxOutputTokens: o.maxOutputTokens,
        // JSON output without a response_schema (see PROVIDER_LIMITS.gemini).
        json: true,
        temperature: 0,
        // Hidden "thinking" tokens are billed as output; extraction needs little of it.
        thinkingConfig: { thinkingLevel: GEMINI_THINKING[o.env.LLM_REASONING_EFFORT] },
        ...(o.baseUrl ? { baseUrl: o.baseUrl } : {}),
      });
    case 'anthropic':
      return new ChatAnthropic({
        ...common,
        apiKey: requireKey(o.env.ANTHROPIC_API_KEY, 'ANTHROPIC_API_KEY'),
        maxTokens: o.maxOutputTokens,
        ...(o.baseUrl ? { anthropicApiUrl: o.baseUrl } : {}),
      });
    case 'ollama':
      return new ChatOllama({
        model: o.model,
        baseUrl: o.baseUrl ?? o.env.OLLAMA_BASE_URL,
        numPredict: o.maxOutputTokens,
      });
  }
}

export interface ImagePart {
  mimeType: 'image/png' | 'image/jpeg';
  data: Uint8Array;
}

export interface InvokeResult {
  /** The provider's structured answer, not yet validated by our schema. */
  parsed: unknown;
  /** Start and end of the raw text (JSON mode), kept so a failure can explain itself. */
  rawPreview?: string;
  usage: Usage;
}

/** One structured call with text + images. */
export async function invokeStructured(
  chat: BaseChatModel,
  schema: z.ZodType,
  system: string,
  userText: string,
  images: readonly ImagePart[],
  jsonMode = false,
): Promise<InvokeResult> {
  const content = [
    { type: 'text' as const, text: userText },
    ...images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mimeType};base64,${Buffer.from(img.data).toString('base64')}` },
    })),
  ];
  const messages = [new SystemMessage(system), new HumanMessage({ content })];

  if (jsonMode) {
    // JSON mode: a plain call whose text is JSON. The shape comes from the prompt; our Zod
    // validation (with one repair) enforces it, so providers' schema quirks don't matter.
    const msg = await chat.invoke(messages);
    const meta = msg.usage_metadata;
    const text = textOf(msg.content);
    return {
      parsed: parseJsonText(text),
      rawPreview: text.length > 240 ? `${text.slice(0, 120)} … ${text.slice(-120)}` : text,
      usage: { inputTokens: meta?.input_tokens ?? 0, outputTokens: meta?.output_tokens ?? 0 },
    };
  }

  const runnable = chat.withStructuredOutput(schema as never, { name: 'answer', includeRaw: true });
  const res = (await runnable.invoke(messages)) as {
    raw: { usage_metadata?: { input_tokens?: number; output_tokens?: number } };
    parsed: unknown;
  };
  const meta = res.raw?.usage_metadata;
  return {
    parsed: res.parsed ?? null,
    usage: { inputTokens: meta?.input_tokens ?? 0, outputTokens: meta?.output_tokens ?? 0 },
  };
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  return Array.isArray(content)
    ? content
        .map((p) => (typeof p === 'string' ? p : ((p as { text?: string }).text ?? '')))
        .join('')
    : String(content ?? '');
}

/**
 * Parse a JSON answer: tolerates ```json fences, text around the object, and trailing commas.
 * Returns null when no JSON object can be recovered.
 */
export function parseJsonText(text: string): unknown {
  const stripped = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const attempts = [stripped];
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start >= 0 && end > start) attempts.push(stripped.slice(start, end + 1));
  const truncated = start >= 0 ? closeTruncatedJson(stripped.slice(start)) : undefined;
  const candidates = [...attempts, ...attempts.map((a) => a.replace(/,\s*([}\]])/g, '$1'))];
  if (truncated) candidates.push(truncated);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try the next repair
    }
  }
  return null;
}

/**
 * Recover the complete part of a JSON answer that stopped early: drop the unfinished last
 * member and close the open brackets. Seen live: a Gemini answer ended at `"total":{`.
 * The caller's checks then flag whatever is missing for review.
 */
export function closeTruncatedJson(text: string): string | undefined {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let lastSafe = -1; // index after the last complete member at any depth
  let safeStack: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') stack.push(c === '{' ? '}' : ']');
    else if (c === '}' || c === ']') {
      stack.pop();
      lastSafe = i + 1;
      safeStack = [...stack];
    } else if (c === ',') {
      lastSafe = i;
      safeStack = [...stack];
    }
  }
  if (stack.length === 0 || lastSafe < 0) return undefined;
  return text.slice(0, lastSafe) + safeStack.reverse().join('');
}
