import createClient from 'openapi-fetch';
import type { paths } from './schema.ts';

/**
 * The typed API client shared by the website and the AI-assistant connector (ADR-0012,
 * ADR-0014). Types are generated from the API's own OpenAPI manual (`pnpm api:types`), so a change
 * in the API's answers shows up in both as a type error.
 */
export type { paths };

/** Full client (reads and writes), for the website. */
export const createApiClient = (baseUrl: string, fetchImpl?: typeof fetch) =>
  createClient<paths>({ baseUrl, ...(fetchImpl ? { fetch: fetchImpl } : {}) });

/**
 * Read-only client, for the AI-assistant connector: it only has `GET`, so no code path can send
 * a write request (ADR-0014, M6 AC-6).
 */
export function createReadOnlyClient(baseUrl: string, fetchImpl?: typeof fetch) {
  const client = createApiClient(baseUrl, fetchImpl);
  return { GET: client.GET.bind(client) } as Pick<typeof client, 'GET'>;
}
export type ReadOnlyClient = ReturnType<typeof createReadOnlyClient>;

type Ok<P extends keyof paths, M extends 'get' | 'post'> = paths[P][M] extends {
  responses: { 200: { content: { 'application/json': infer T } } };
}
  ? T
  : never;

export type Overview = Ok<'/overview', 'get'>;
export type ExceptionItem = Ok<'/exceptions', 'get'>[number];
export type ExceptionDetail = Ok<'/exceptions/{id}', 'get'>;
export type ComparisonRow = ExceptionDetail['comparison'][number];
export type Line = NonNullable<ComparisonRow['po']>;
export type SetSummary = Ok<'/sets', 'get'>[number];
export type SetDetail = Ok<'/sets/{poNumber}', 'get'>;
export type HistoryEntry = Ok<'/sets/{poNumber}/history', 'get'>[number];
export type DocumentSummary = Ok<'/documents', 'get'>[number];
export type DocumentDetail = Ok<'/documents/{id}', 'get'>;
export type Me = Ok<'/me', 'get'>;
export type DecisionAction = paths['/exceptions/{id}/decision']['post']['requestBody'] extends
  { content: { 'application/json': { action: infer A } } } | undefined
  ? A
  : never;

/** An API error in plain words; the API always answers errors as problem JSON. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** Unwrap an openapi-fetch result: the data, or a readable ApiError. */
export async function unwrap<T>(
  p: Promise<{ data?: T; error?: unknown; response: Response }>,
  unreachable = "Couldn't reach the server. Check that `pnpm dev` is running.",
): Promise<T> {
  let r;
  try {
    r = await p;
  } catch {
    throw new ApiError(unreachable, 0);
  }
  if (r.error !== undefined || r.data === undefined) {
    const e = r.error as { detail?: string; title?: string } | undefined;
    throw new ApiError(
      e?.detail ?? e?.title ?? `The server answered ${r.response.status}.`,
      r.response.status,
    );
  }
  return r.data;
}
