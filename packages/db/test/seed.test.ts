import { afterAll, describe, expect, it } from 'vitest';
import { seed } from '../src/seed.ts';
import { hasTestDb, testClient } from './helpers.ts';

describe.skipIf(!hasTestDb)('seed (M1 AC-8)', () => {
  const db = hasTestDb ? testClient() : undefined!;
  afterAll(() => db?.$disconnect());

  const counts = async () => ({
    users: await db.user.count(),
    vendors: await db.vendor.count(),
    items: await db.catalogItem.count(),
  });

  it('creates 1 user, 15 vendors, and the catalog, and is idempotent', async () => {
    const expected = await seed(db);
    const first = await counts();
    await seed(db);
    expect(await counts()).toEqual(first);
    expect(first).toEqual(expected);
    expect(first.vendors).toBe(15);
    expect(first.users).toBe(1);
  }, 60_000);
});
