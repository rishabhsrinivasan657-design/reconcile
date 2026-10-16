import { afterAll, describe, expect, it } from 'vitest';
import { hasTestDb, testClient } from './helpers.ts';

describe.skipIf(!hasTestDb)('schema (M1 AC-6)', () => {
  const db = hasTestDb ? testClient() : undefined!;
  afterAll(() => db?.$disconnect());

  it('stores every money column as NUMERIC(14,4) (ADR-0004)', async () => {
    const rows = await db.$queryRaw<{ table: string; column: string; type: string }[]>`
      SELECT table_name AS "table", column_name AS "column",
             data_type || '(' || numeric_precision || ',' || numeric_scale || ')' AS "type"
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name IN ('unitPrice', 'amount')`;
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r.type).toBe('numeric(14,4)');
  });

  it('creates every entity from architecture §5', async () => {
    const rows = await db.$queryRaw<{ table: string }[]>`
      SELECT table_name AS "table" FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'`;
    expect(rows.map((r) => r.table).sort()).toEqual(
      [
        'AuditEvent',
        'CatalogItem',
        'Document',
        'DocumentSet',
        'Exception',
        'ExceptionActionRecord',
        'Extraction',
        'LineMatch',
        'LlmCall',
        'MatchRun',
        'User',
        'Vendor',
      ].sort(),
    );
  });
});
