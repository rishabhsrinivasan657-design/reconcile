import type { Prisma, PrismaClient } from '@reconcile/db';
import type { z } from 'zod';
import type { ExceptionStatus, ExceptionType, ExceptionView } from './schemas.ts';

export class NotFound extends Error {}

export const problem = (status: number, title: string, detail?: string) => ({
  type: `https://httpstatuses.io/${status}`,
  title,
  status,
  ...(detail ? { detail } : {}),
});

const exceptionInclude = {
  actions: { include: { user: true }, orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ExceptionInclude;
type ExceptionRow = Prisma.ExceptionGetPayload<{ include: typeof exceptionInclude }>;

/** Each set with its latest match run (older runs are history, not current problems). */
export const setsWithLatestRun = (db: PrismaClient, where: Prisma.DocumentSetWhereInput = {}) =>
  db.documentSet.findMany({
    where,
    orderBy: { poNumber: 'asc' },
    include: {
      vendor: true,
      documents: true,
      matchRuns: {
        orderBy: { version: 'desc' },
        take: 1,
        include: { exceptions: { include: exceptionInclude }, lineMatch: true },
      },
    },
  });

export { exceptionInclude };

export function exceptionView(
  e: ExceptionRow,
  ctx: { poNumber: string; version: number; vendorName: string | null },
): z.infer<typeof ExceptionView> {
  const last = e.actions.at(-1);
  return {
    id: e.id,
    poNumber: ctx.poNumber,
    vendorName: ctx.vendorName,
    type: e.type as z.infer<typeof ExceptionType>,
    status: e.status as z.infer<typeof ExceptionStatus>,
    informational: e.informational,
    amount: e.amount.toFixed(2),
    explanation: e.explanation,
    lines: e.lineKeys as string[],
    documentIds: e.documentIds as string[],
    carriedOverFromId: e.carriedOverFromId,
    matchRunVersion: ctx.version,
    decision: last
      ? {
          action: last.action,
          note: last.note,
          by: last.user.name,
          at: last.createdAt.toISOString(),
        }
      : null,
  };
}

/** Largest money at risk first; informational ($0 impact) problems last. */
export const byImpact = (a: z.infer<typeof ExceptionView>, b: z.infer<typeof ExceptionView>) =>
  Number(a.informational) - Number(b.informational) ||
  Number(b.amount) - Number(a.amount) ||
  a.poNumber.localeCompare(b.poNumber);
