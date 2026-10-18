# ADR-0014: The AI-assistant connector reads through the API

- **Status:** Accepted
- **Date:** 2026-10-18
- **Requirements:** FR-14, US-11, M6 AC-2, AC-6 (answer to M6 Q1)

## Context
The MCP server gives AI assistants read-only access to Reconcile. The architecture first sketched
it reading the database directly. Since then, the API has gained all the explanations, history
sentences, and grouping rules the website shows (M5), and ADR-0012 promised that the website and
the coming connector would behave the same.

## Options
1. **Read the database directly** with a read-only database login: works without the API / repeats
   the API's query and wording logic, so the website and the assistant could drift apart.
2. **Read through the API**, using the same typed client as the website: one source of truth and
   read-only by construction / the API must be running.

## Decision
Option 2. The MCP server calls the API with a client that only has a `get` method. The typed client
(generated from the API's OpenAPI manual) moves from the website into a shared package,
`packages/api-client`, used by both. The server runs locally and talks to the assistant over
standard input/output.

## Consequences
- ➕ The assistant and the website always give the same answers, from the same code.
- ➕ No write path exists, which is the strongest kind of "read-only".
- ➕ When the API changes shape, both the website and the connector fail to type-check.
- ➖ `pnpm dev` (or the API) must be running for the connector to work.
- ➖ The architecture diagram's "MCP → database" arrow is replaced by "MCP → API".
