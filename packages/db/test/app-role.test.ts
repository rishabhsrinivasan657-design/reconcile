import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAppRole, appRoleStatements } from '../src/app-role.ts';
import { createPrismaClient } from '../src/client.ts';
import { hasTestDb, testClient, testDbUrl } from './helpers.ts';

const USER = 'reconcile_app_test';
const PASSWORD = "test-pass-with-'quote";

describe.skipIf(!hasTestDb)(
  'the app database user cannot change history (M7 AC-10, ADR-0005)',
  () => {
    const owner = hasTestDb ? testClient() : undefined!;
    let app: ReturnType<typeof createPrismaClient>;
    let eventId: bigint;

    beforeAll(async () => {
      await applyAppRole(owner, USER, PASSWORD);
      // Running it twice is safe (it runs after every deploy).
      await applyAppRole(owner, USER, PASSWORD);
      const url = new URL(testDbUrl!);
      url.username = USER;
      url.password = PASSWORD;
      app = createPrismaClient(url.toString());
      eventId = (
        await owner.auditEvent.create({
          data: {
            actorType: 'SYSTEM',
            action: 'test.role',
            entityType: 'Test',
            entityId: 'role-test',
          },
        })
      ).id;
    });
    afterAll(async () => {
      await app?.$disconnect();
      await owner?.$disconnect();
    });

    it('can read and add history entries', async () => {
      await expect(app.auditEvent.findUnique({ where: { id: eventId } })).resolves.toBeTruthy();
      await expect(
        app.auditEvent.create({
          data: {
            actorType: 'SYSTEM',
            action: 'test.app-insert',
            entityType: 'Test',
            entityId: 'role-test',
          },
        }),
      ).resolves.toBeTruthy();
    });

    it('is refused by permissions (not only the trigger) on UPDATE, DELETE, and TRUNCATE', async () => {
      const denied = /permission denied for table AuditEvent/;
      await expect(
        app.$executeRawUnsafe(`UPDATE "AuditEvent" SET action = 'x' WHERE id = ${eventId}`),
      ).rejects.toThrow(denied);
      await expect(
        app.$executeRawUnsafe(`DELETE FROM "AuditEvent" WHERE id = ${eventId}`),
      ).rejects.toThrow(denied);
      await expect(app.$executeRawUnsafe(`TRUNCATE "AuditEvent"`)).rejects.toThrow(denied);
    });

    it('can still work with the normal tables, but not the migration records', async () => {
      await expect(app.user.findMany()).resolves.toBeInstanceOf(Array);
      await expect(
        app.$executeRawUnsafe(`UPDATE "User" SET name = name WHERE false`),
      ).resolves.toBe(0);
      await expect(app.$queryRawUnsafe(`SELECT * FROM "_prisma_migrations"`)).rejects.toThrow(
        /permission denied/,
      );
    });

    it('refuses unsafe user names', () => {
      expect(() => appRoleStatements('app"; DROP TABLE x; --', 'p')).toThrow(
        /Invalid database user name/,
      );
    });
  },
);
