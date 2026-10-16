# ADR-0004: Money as decimals, never floats

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16
- **Requirements:** NFR-07

## Context
In JavaScript, `0.1 + 0.2 !== 0.3`. Price-variance tolerances of $0.01 and
sums over hundreds of lines make float errors produce false exceptions.

## Options
1. JS `number`. Simple, but wrong at the edges.
2. Integer minor units (cents). Exact, but unit prices often have sub-cent
   precision (e.g. $0.0425/each).
3. **Decimal type end to end.**

## Decision
Option 3. Postgres `NUMERIC(14,4)` via Prisma `Decimal`, and `decimal.js` in
`core`. Zod schemas parse money from strings or numbers into `Decimal`. Values
cross the API as strings. A lint rule bans arithmetic on money values typed as `number`.

## Consequences
- ➕ Exact sums and tolerance checks.
- ➖ Slightly more verbose code (`a.plus(b)` instead of `a + b`).
