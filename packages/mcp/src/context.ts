import { ApiError, type ReadOnlyClient } from '@reconcile/api-client';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/** What every tool gets: the read-only API client and where the website lives (for links). */
export interface ToolContext {
  api: ReadOnlyClient;
  apiUrl: string;
  webUrl: string;
}

/** Links back to the evidence on the website (M6 AC-5). */
export const links = (webUrl: string) => ({
  po: (po: string) => `${webUrl}/pos/${encodeURIComponent(po)}`,
  problem: (id: string, open = true) =>
    `${webUrl}/problems?id=${encodeURIComponent(id)}${open ? '' : '&show=decided'}`,
  document: (id: string) => `${webUrl}/documents/${encodeURIComponent(id)}`,
});

/** A tool answer: a short plain-English summary plus the same data, structured (M6 AC-4). */
export function answer<T extends Record<string, unknown>>(text: string, data: T): CallToolResult {
  return { content: [{ type: 'text', text }], structuredContent: data };
}

/** A tool error the assistant can relay ("start the API"), never a crash. */
export function toolError(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Run a tool body; API problems become helpful tool errors. */
export async function guarded(
  ctx: ToolContext,
  body: () => Promise<CallToolResult>,
  notFound?: string,
): Promise<CallToolResult> {
  try {
    return await body();
  } catch (e) {
    if (e instanceof ApiError) {
      if (e.status === 0)
        return toolError(
          `Reconcile's API isn't reachable at ${ctx.apiUrl}. Start it with \`pnpm dev\` (or \`pnpm dev:demo\`) and try again.`,
        );
      if (e.status === 404 && notFound) return toolError(notFound);
      return toolError(`Reconcile's API said: ${e.message}`);
    }
    throw e;
  }
}
