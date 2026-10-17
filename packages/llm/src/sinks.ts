/** Where LlmCall records go (M3 AC-4): the database in the CLI/worker, memory in evals and CI. */
export interface LlmCallRecord {
  provider: string;
  model: string;
  promptVersion: string;
  purpose: 'EXTRACT' | 'FUZZY_MATCH';
  documentRef?: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cacheHit: boolean;
  costUsd: number | null;
  error?: string;
}

export interface CallSink {
  record(call: LlmCallRecord): void | Promise<void>;
}

export class MemorySink implements CallSink {
  readonly calls: LlmCallRecord[] = [];
  record(call: LlmCallRecord) {
    this.calls.push(call);
  }
}

export const nullSink: CallSink = { record: () => {} };
