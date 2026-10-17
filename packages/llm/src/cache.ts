import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Usage } from './prices.ts';

export interface CacheEntry {
  keyParts: string[];
  provider: string;
  model: string;
  promptVersion: string;
  data: unknown;
  usage: Usage;
  /** Latency of the original live call, replayed so evals report identical numbers. */
  latencyMs: number;
  costUsd: number | null;
}

export interface CacheStore {
  get(key: string): CacheEntry | undefined;
  set(key: string, entry: CacheEntry): void;
}

export const sha256 = (data: string | Uint8Array) =>
  createHash('sha256').update(data).digest('hex');

/** `sha256(file bytes) | prompt version | provider | model` (ADR-0002, M3 AC-3). */
export const cacheKey = (parts: readonly string[]) => sha256(parts.join('|'));

/** One JSON file per key. Used for the CLI (.cache/llm) and evals (evals/cache, committed). */
export class FileCacheStore implements CacheStore {
  constructor(readonly dir: string) {}

  private file(key: string) {
    return path.join(this.dir, `${key}.json`);
  }

  get(key: string): CacheEntry | undefined {
    const f = this.file(key);
    return fs.existsSync(f) ? (JSON.parse(fs.readFileSync(f, 'utf8')) as CacheEntry) : undefined;
  }

  set(key: string, entry: CacheEntry): void {
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(this.file(key), JSON.stringify(entry, null, 2) + '\n');
  }
}

export class MemoryCacheStore implements CacheStore {
  readonly entries = new Map<string, CacheEntry>();
  get(key: string) {
    return this.entries.get(key);
  }
  set(key: string, entry: CacheEntry) {
    this.entries.set(key, entry);
  }
}
