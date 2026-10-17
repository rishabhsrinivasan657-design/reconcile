import createClient from 'openapi-fetch';
import type { paths } from '../api/schema';

/**
 * The typed API client (ADR-0012). Types come from the API's own OpenAPI manual, so a change in
 * the API's answers shows up here as a type error. Requests go to /api, which Next forwards.
 */
export const api = createClient<paths>({ baseUrl: '/api' });

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
): Promise<T> {
  let r;
  try {
    r = await p;
  } catch {
    throw new ApiError("Couldn't reach the server. Check that `pnpm dev` is running.", 0);
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
