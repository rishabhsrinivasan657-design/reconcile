/**
 * Apply the app user's permissions (run by deploy/update.sh after migrations, as the owner).
 * Reads DATABASE_URL (owner), APP_DB_USER, and APP_DB_PASSWORD from the environment.
 */
import { applyAppRole } from './app-role.ts';
import { createPrismaClient } from './client.ts';

const { DATABASE_URL, APP_DB_USER, APP_DB_PASSWORD } = process.env;
if (!DATABASE_URL || !APP_DB_USER || !APP_DB_PASSWORD) {
  console.error('Set DATABASE_URL (owner), APP_DB_USER, and APP_DB_PASSWORD.');
  process.exit(1);
}
const db = createPrismaClient(DATABASE_URL);
await applyAppRole(db, APP_DB_USER, APP_DB_PASSWORD);
await db.$disconnect();
console.log(`App database user "${APP_DB_USER}" is ready (no edits to history).`);
