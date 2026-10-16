import { z } from 'zod';

export class EnvError extends Error {
  override name = 'EnvError';
}

/**
 * Validate environment variables against a schema and fail fast with a readable message.
 * Each package declares only the variables it uses.
 */
export function loadEnv<T extends z.ZodType>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    throw new EnvError(
      `Invalid environment configuration:\n${z.prettifyError(result.error)}\n` +
        'See .env.example for the full list of variables.',
    );
  }
  return result.data;
}

export const postgresUrl = z
  .string({ error: 'is required' })
  .regex(/^postgres(ql)?:\/\//, 'must be a postgres:// or postgresql:// URL');
