import { pathToFileURL } from 'node:url';
import { buildCatalog } from '@reconcile/generator/catalog';
import { createPrismaClient } from './client.ts';
import type { PrismaClient } from './generated/prisma/client.ts';

export const SEED_USER = { email: 'ap.clerk@harborandpine.example', name: 'Alex Rivera (AP)' };

/**
 * Idempotent seed (M1 AC-8): the single user plus vendors and catalog from the generator,
 * so the database and the generated documents agree. Safe to run repeatedly.
 */
export async function seed(db: PrismaClient) {
  const catalog = buildCatalog();
  await db.user.upsert({
    where: { email: SEED_USER.email },
    update: { name: SEED_USER.name },
    create: SEED_USER,
  });

  for (const v of catalog.vendors) {
    const data = { name: v.name, address: v.address, invoicePrefix: v.invoicePrefix };
    const vendor = await db.vendor.upsert({
      where: { code: v.code },
      update: data,
      create: { code: v.code, ...data },
    });
    for (const item of catalog.items.filter((i) => i.vendorCode === v.code)) {
      const fields = {
        description: item.description,
        uom: item.uom,
        packSize: item.packSize,
        unitPrice: item.unitPrice,
      };
      await db.catalogItem.upsert({
        where: { vendorId_sku: { vendorId: vendor.id, sku: item.sku } },
        update: fields,
        create: { vendorId: vendor.id, sku: item.sku, ...fields },
      });
    }
  }
  return { users: 1, vendors: catalog.vendors.length, items: catalog.items.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const db = createPrismaClient();
  seed(db)
    .then((counts) => console.log('Seeded', counts))
    .finally(() => db.$disconnect());
}
