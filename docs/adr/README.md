# Architecture Decision Records

One file per significant decision: `NNNN-short-title.md`, using
[`../templates/adr.md`](../templates/adr.md). ADRs are **never edited after
acceptance**. To change a decision, write a new ADR that supersedes the old
one and update the old one's status line.

| # | Decision | Status |
|---|---|---|
| [0001](0001-monorepo-with-pure-core.md) | pnpm monorepo with a pure `core` package | Accepted |
| [0002](0002-llm-provider-interface.md) | LLM behind a provider interface with a shared rate limiter and response cache | Accepted |
| [0003](0003-deterministic-first-matching.md) | Deterministic rules first; LLM only for fuzzy description matching | Accepted |
| [0004](0004-money-as-decimal.md) | Money as decimals, never floats | Accepted |
| [0005](0005-append-only-audit-log.md) | Append-only audit log enforced by a Postgres trigger | Accepted |
| [0006](0006-evals-synthetic-golden-set.md) | Seeded synthetic golden set, replay-mode CI, 2-point regression gate | Accepted |
