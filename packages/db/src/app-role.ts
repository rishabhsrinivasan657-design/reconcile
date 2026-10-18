import type { PrismaClient } from './generated/prisma/client.ts';

/**
 * The database user the app runs as in the cloud (ADR-0005 part 2, M7 AC-10). It may read and write
 * the normal tables, but may only read and add to `AuditEvent`: no UPDATE, DELETE, or TRUNCATE.
 * The append-only trigger stays as a second lock. Migrations keep running as the owner.
 *
 * Safe to run again after every migration: it creates the user once, refreshes its password, and
 * re-applies the permissions to any new tables.
 */
export function appRoleStatements(user: string, password: string): string[] {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user)) throw new Error(`Invalid database user name: ${user}`);
  const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
  return [
    `DO $$ BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${lit(user)}) THEN
         CREATE ROLE "${user}" LOGIN PASSWORD ${lit(password)};
       ELSE
         ALTER ROLE "${user}" LOGIN PASSWORD ${lit(password)};
       END IF;
     END $$`,
    `GRANT USAGE ON SCHEMA public TO "${user}"`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${user}"`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${user}"`,
    // History can be read and added to, never changed.
    `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM "${user}"`,
    // The app has no business with the migration bookkeeping.
    `REVOKE ALL ON "_prisma_migrations" FROM "${user}"`,
  ];
}

export async function applyAppRole(
  db: PrismaClient,
  user: string,
  password: string,
): Promise<void> {
  for (const sql of appRoleStatements(user, password)) await db.$executeRawUnsafe(sql);
}
