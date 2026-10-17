import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LlmEnv } from '../src/env.ts';
import type { Clock } from '../src/limiter.ts';

export function fakeClock(start = Date.parse('2026-10-17T12:00:00Z')): Clock & { slept: number[] } {
  let t = start;
  const slept: number[] = [];
  return {
    slept,
    now: () => t,
    sleep: async (ms) => {
      slept.push(ms);
      t += ms;
    },
  };
}

export const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'reconcile-llm-'));

export const testEnv = (over: Record<string, string> = {}) =>
  LlmEnv.parse({
    LLM_PROVIDER: 'openai',
    LLM_MODEL_EXTRACT: 'gpt-6-luna',
    OPENAI_API_KEY: 'sk-test-not-real',
    LLM_CACHE_DIR: tmpDir(),
    ...over,
  });
