import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { unwrap } from '@reconcile/api-client';
import { z } from 'zod';
import { answer, guarded, type ToolContext } from '../context.ts';
import { money, plural, problemWords } from '../format.ts';

export function registerGetOverview(server: McpServer, ctx: ToolContext) {
  server.registerTool(
    'get_overview',
    {
      title: 'Overview',
      description:
        "The headline numbers: money at risk across open problems, open problems by type, purchase-order counts by status, documents needing review, and the AI's cost and speed per document. " +
        'Example: "How are we doing this week?"',
      inputSchema: {},
      outputSchema: {
        moneyAtRisk: z.string(),
        openProblems: z.number(),
        forYourRecords: z.number().describe('Open $0 problems, e.g. short-ships billed correctly'),
        decidedThisWeek: z.number(),
        byType: z.array(z.object({ type: z.string(), count: z.number(), amount: z.string() })),
        purchaseOrders: z.object({
          total: z.number(),
          matched: z.number(),
          waiting: z.number(),
          needsReview: z.number(),
        }),
        documentsNeedingReview: z.number(),
        aiCostPerDocumentUsd: z.string().nullable(),
        link: z.string(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () =>
      guarded(ctx, async () => {
        const o = await unwrap(ctx.api.GET('/overview'));
        const text = [
          `${money(o.moneyAtRisk)} at risk across ${plural(o.openProblems, 'open problem')} (${o.informational} more for your records, $0). ${o.decidedThisWeek} decided this week.`,
          ...o.byType.map((t) => `- ${problemWords(t.type)}: ${t.count}, ${money(t.amount)}`),
          `Purchase orders: ${o.sets.total} (${o.sets.matched} matched, ${o.sets.waiting} waiting, ${o.sets.needsReview} need review). Documents needing review: ${o.documents.needsReview}.`,
          `AI cost per document: ${o.ai.costPerDocumentUsd === null ? 'unknown' : `$${Number(o.ai.costPerDocumentUsd).toFixed(4)}`} at list price.`,
          ctx.webUrl,
        ].join('\n');
        return answer(text, {
          moneyAtRisk: o.moneyAtRisk,
          openProblems: o.openProblems,
          forYourRecords: o.informational,
          decidedThisWeek: o.decidedThisWeek,
          byType: o.byType,
          purchaseOrders: o.sets,
          documentsNeedingReview: o.documents.needsReview,
          aiCostPerDocumentUsd: o.ai.costPerDocumentUsd,
          link: ctx.webUrl,
        });
      }),
  );
}
