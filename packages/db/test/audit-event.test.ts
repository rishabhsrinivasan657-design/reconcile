import { afterAll, describe, expect, it } from 'vitest';
import { hasTestDb, testClient } from './helpers.ts';

describe.skipIf(!hasTestDb)('AuditEvent is append-only (M1 AC-7, ADR-0005)', () => {
  const db = hasTestDb ? testClient() : undefined!;
  afterAll(() => db?.$disconnect());

  const insert = () =>
    db.auditEvent.create({
      data: {
        actorType: 'SYSTEM',
        action: 'test.inserted',
        entityType: 'Test',
        entityId: 'audit-test',
        after: { ok: true },
      },
    });

  it('allows INSERT', async () => {
    const event = await insert();
    expect(event.id).toBeTypeOf('bigint');
  });

  it('rejects UPDATE', async () => {
    const event = await insert();
    await expect(
      db.auditEvent.update({ where: { id: event.id }, data: { action: 'tampered' } }),
    ).rejects.toThrow(/append-only \(UPDATE blocked\)/);
  });

  it('rejects DELETE', async () => {
    const event = await insert();
    await expect(db.auditEvent.delete({ where: { id: event.id } })).rejects.toThrow(
      /append-only \(DELETE blocked\)/,
    );
  });

  it('rejects raw SQL UPDATE too, not just the ORM', async () => {
    await insert();
    await expect(
      db.$executeRaw`UPDATE "AuditEvent" SET action = 'tampered' WHERE "entityId" = 'audit-test'`,
    ).rejects.toThrow(/append-only/);
  });
});
