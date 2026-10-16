import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** Bring the test database to the latest migration before integration tests run. */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    console.warn('DATABASE_URL_TEST is not set: skipping database integration tests.');
    return;
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
