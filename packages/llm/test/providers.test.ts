import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { MemoryCacheStore } from '../src/cache.ts';
import { LlmClient } from '../src/client.ts';
import type { Provider } from '../src/env.ts';
import { fakeClock, testEnv } from './helpers.ts';

/** A local stand-in for each provider's HTTP API, returning one structured answer. */
const ANSWER = { total: '10.00' };
const seen: { path: string; body: string }[] = [];
let server: http.Server;
let base = '';

function respond(path: string, body: string): unknown {
  if (path.endsWith('/responses')) {
    return {
      id: 'resp_1',
      object: 'response',
      created_at: 0,
      status: 'completed',
      model: 'gpt-6-luna',
      output: [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: JSON.stringify(ANSWER), annotations: [] }],
        },
      ],
      usage: { input_tokens: 1200, output_tokens: 300, total_tokens: 1500 },
    };
  }
  if (path.endsWith('/chat/completions')) {
    const wantsTool = body.includes('"tools"');
    return {
      id: 'c1',
      object: 'chat.completion',
      created: 0,
      model: 'gpt-6-luna',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: wantsTool
            ? {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 't1',
                    type: 'function',
                    function: { name: 'answer', arguments: JSON.stringify(ANSWER) },
                  },
                ],
              }
            : { role: 'assistant', content: JSON.stringify(ANSWER) },
        },
      ],
      usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 },
    };
  }
  if (path.endsWith('/messages')) {
    return {
      id: 'm1',
      type: 'message',
      role: 'assistant',
      model: 'claude-test',
      stop_reason: 'tool_use',
      content: [{ type: 'tool_use', id: 'tu1', name: 'answer', input: ANSWER }],
      usage: { input_tokens: 1200, output_tokens: 300 },
    };
  }
  if (path.includes(':generateContent')) {
    const wantsTool = body.includes('functionDeclarations');
    return {
      candidates: [
        {
          index: 0,
          finishReason: 'STOP',
          content: {
            role: 'model',
            parts: wantsTool
              ? [{ functionCall: { name: 'answer', args: ANSWER } }]
              : [{ text: JSON.stringify(ANSWER) }],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 300, totalTokenCount: 1500 },
    };
  }
  if (path.endsWith('/api/chat')) {
    return {
      model: 'llava',
      created_at: '2026-10-17T00:00:00Z',
      done: true,
      done_reason: 'stop',
      message: { role: 'assistant', content: JSON.stringify(ANSWER) },
      prompt_eval_count: 1200,
      eval_count: 300,
    };
  }
  return { error: `unexpected path ${path}` };
}

beforeAll(async () => {
  server = http.createServer((rq, rs) => {
    let body = '';
    rq.on('data', (c) => (body += c));
    rq.on('end', () => {
      seen.push({ path: rq.url ?? '', body });
      rs.setHeader('content-type', 'application/json');
      rs.end(JSON.stringify(respond(rq.url ?? '', body)));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

const cases: [Provider, string, string][] = [
  ['openai', 'gpt-6-luna', '/v1'],
  ['anthropic', 'claude-test', ''],
  ['gemini', 'gemini-3.5-flash-lite', ''],
  ['ollama', 'llava', ''],
];

describe('providers through LangChain, against a local mock API (AC-1)', () => {
  it.each(cases)(
    '%s: sends text + image and returns the structured answer with usage',
    async (provider, model, suffix) => {
      seen.length = 0;
      const env = testEnv({
        GEMINI_API_KEY: 'g-test',
        ANTHROPIC_API_KEY: 'a-test',
        LLM_BUDGET_USD: '100',
      });
      const client = new LlmClient({
        env,
        provider,
        model,
        baseUrl: `${base}${suffix}`,
        cache: new MemoryCacheStore(),
        clock: fakeClock(),
      });
      // Unknown list prices (claude-test, llava) are allowed only for $0 local models; give the test ones a price.
      if (provider === 'anthropic')
        (await import('../src/prices.ts')).PRICES['claude-test'] = { input: 1, output: 1 };
      const r = await client.generateStructured({
        purpose: 'EXTRACT',
        promptVersion: 'extract.v1',
        system: 'sys',
        userText: 'read this',
        images: [{ mimeType: 'image/png', data: new Uint8Array([137, 80, 78, 71]) }],
        schema: z.object({ total: z.string() }),
        cacheKeyParts: ['f'],
      });
      expect(r.data).toEqual(ANSWER);
      expect(r.usage).toEqual({ inputTokens: 1200, outputTokens: 300 });
      expect(seen).toHaveLength(1);
      expect(seen[0]!.body).toContain('iVBORw'.slice(0, 4)); // base64 of the PNG magic bytes
    },
  );
});
