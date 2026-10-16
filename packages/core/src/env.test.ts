import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { EnvError, loadEnv, postgresUrl } from './env.ts';

const schema = z.object({ DATABASE_URL: postgresUrl });

describe('loadEnv (M1 AC-5)', () => {
  it('returns parsed values when valid', () => {
    const env = loadEnv(schema, { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' });
    expect(env.DATABASE_URL).toContain('localhost');
  });

  it('fails fast with a readable message when a variable is missing', () => {
    expect(() => loadEnv(schema, {})).toThrow(EnvError);
    expect(() => loadEnv(schema, {})).toThrow(/is required[\s\S]*at DATABASE_URL/);
  });

  it('rejects a malformed value and points to .env.example', () => {
    expect(() => loadEnv(schema, { DATABASE_URL: 'mysql://x' })).toThrow(
      /postgres[\s\S]*\.env\.example/,
    );
  });
});
