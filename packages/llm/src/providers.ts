/**
 * The only file that imports LangChain (ADR-0010). It turns a provider name into a chat model
 * and runs one structured, multimodal call. Everything around it (cache, limits, budget, log)
 * is ours.
 */
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
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

function requireKey(value: string | undefined, name: string): string {
  if (!value)
    throw new Error(`${name} is not set. Add it to your .env (never paste keys in chat).`);
  return value;
}

export function createChatModel(o: ModelOptions): BaseChatModel {
  // LangChain's own retries are off: our retry layer owns them so every attempt is logged.
  const common = { model: o.model, maxRetries: 0 };
  switch (o.provider) {
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
  usage: Usage;
}

/** One structured call with text + images. */
export async function invokeStructured(
  chat: BaseChatModel,
  schema: z.ZodType,
  system: string,
  userText: string,
  images: readonly ImagePart[],
): Promise<InvokeResult> {
  const runnable = chat.withStructuredOutput(schema as never, { name: 'answer', includeRaw: true });
  const content = [
    { type: 'text' as const, text: userText },
    ...images.map((img) => ({
      type: 'image_url' as const,
      image_url: { url: `data:${img.mimeType};base64,${Buffer.from(img.data).toString('base64')}` },
    })),
  ];
  const res = (await runnable.invoke([
    new SystemMessage(system),
    new HumanMessage({ content }),
  ])) as {
    raw: { usage_metadata?: { input_tokens?: number; output_tokens?: number }; content?: unknown };
    parsed: unknown;
  };
  const meta = res.raw?.usage_metadata;
  return {
    parsed: res.parsed ?? null,
    usage: { inputTokens: meta?.input_tokens ?? 0, outputTokens: meta?.output_tokens ?? 0 },
  };
}
