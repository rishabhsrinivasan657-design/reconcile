# ADR-0001: pnpm monorepo with a pure `core` package

- **Status:** Proposed
- **Date:** 2026-10-16
- **Requirements:** NFR-05, NFR-08

## Context
We have a UI, an API, a worker, an MCP server, a generator, and evals. They
share types (document schemas, exception types) and logic (matching). Copying
types between repos drifts. One app containing everything makes the logic
hard to test without a database and server.

## Options
1. **Separate repos.** Clear isolation, but shared types need publishing and
   versioning. Too heavy for one developer.
2. **Single app** (e.g. Next.js with API routes plus a background thread).
   Simplest, but couples the UI, long-running jobs, and logic.
3. **pnpm workspace monorepo** with shared packages, and the business logic
   isolated in a dependency-free `core`.

## Decision
Option 3. `packages/core` contains only pure TypeScript: Zod schemas, the
matching engine, the LLM client, and prompts. It may not import Prisma,
Fastify, Next, or BullMQ. An ESLint `no-restricted-imports` rule enforces this.

## Consequences
- ➕ Core logic is unit-testable and eval-able without Docker.
- ➕ One `pnpm test`/`pnpm eval` across everything, with atomic PRs across packages.
- ➖ Some workspace tooling setup (tsconfig references, build order).
- ➖ The LLM client needs Redis for rate limiting, so it takes the limiter as
  an injected interface rather than importing Redis directly.
