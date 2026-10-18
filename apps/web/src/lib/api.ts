import { createApiClient } from '@reconcile/api-client';

/** The website's API client. Requests go to /api, which Next forwards to the API (ADR-0012). */
export const api = createApiClient('/api');

export { ApiError, unwrap } from '@reconcile/api-client';
export type * from '@reconcile/api-client';
