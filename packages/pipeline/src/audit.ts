import type { Prisma } from '@reconcile/db';

type Tx = Prisma.TransactionClient;

export interface AuditEntry {
  action: string;
  entityType: 'Document' | 'DocumentSet' | 'MatchRun' | 'Exception';
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Write one history entry, inside the same transaction as the change it describes (M4 AC-8).
 * The table is append-only: the database rejects edits and deletes (ADR-0005).
 */
export async function audit(tx: Tx, e: AuditEntry): Promise<void> {
  await tx.auditEvent.create({
    data: {
      actorType: 'SYSTEM',
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      ...(e.before !== undefined ? { before: e.before as Prisma.InputJsonValue } : {}),
      ...(e.after !== undefined ? { after: e.after as Prisma.InputJsonValue } : {}),
    },
  });
}
