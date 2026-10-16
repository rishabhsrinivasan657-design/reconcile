# ADR-0005: Append-only audit log enforced by a Postgres trigger

- **Status:** Proposed
- **Date:** 2026-10-16
- **Requirements:** FR-12, NFR-06

## Context
Payment decisions must be provable later. "We promise not to update that
table" isn't proof. A bug or a careless script could rewrite history.

## Options
1. Convention only (the app never updates). Easy to break silently.
2. A separate DB role without UPDATE/DELETE grants. Good, but adds
   role-management setup to local dev.
3. **A trigger** that raises an error on any UPDATE or DELETE of `AuditEvent`.
   It's added via a raw SQL Prisma migration.

## Decision
Option 3 now, and option 2 later at deploy (M7) as defense in depth. Each
event stores `actor`, `action`, `entityType`, `entityId`, `before`/`after`
JSON, and `createdAt`. Writes happen in the **same transaction** as the change
they describe.

## Consequences
- ➕ History is tamper-resistant even against app bugs. A test proves UPDATE fails.
- ➖ Fixing a wrong audit entry means appending a correcting event, which is the point.
- ➖ Test DB resets must `TRUNCATE` (which the trigger allows) rather than `DELETE`.
