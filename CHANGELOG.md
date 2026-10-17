# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.3.0] - 2026-10-17

M2: matching engine and eval harness ([PR #2](https://github.com/rishabhsrinivasan657-design/reconcile/pull/2)).

### Added
- Matching engine in `packages/core`: groups documents by PO, detects duplicate invoices
  (same number, or same total within 45 days), pairs lines by SKU and then by description
  with a non-AI text-similarity matcher (ADR-0009), and raises all 7 FR-09 exceptions with
  tolerances, count-once dollar amounts, and plain-English explanations.
- `ExtractedDocument` schema: the input shape M3's LLM extraction will produce.
- `pnpm eval`: scores grouping, line links, exceptions (per type), amounts, and latency
  against the answer keys; writes `evals/results/*.json` with every mistake.
- Baseline gate: `evals/baseline.json` plus `--check-baseline` fails on any drop over 2 points.
  A new CI job, "Evals (CI subset)", runs it on every PR.
- Generator 0.3.0: `price_noise` near-miss planted type (inside tolerance, no exception).

### Changed
- `main` is protected: merging needs lint/typecheck/docs, tests, and evals to pass.
- `pnpm generate:ci` draws its 20 sets from a 200-set pool; the CI subset was regenerated.

## [0.2.0] - 2026-10-16

M1: foundation and synthetic data ([PR #1](https://github.com/rishabhsrinivasan657-design/reconcile/pull/1)).

### Added
- pnpm monorepo (`packages/core`, `packages/db`, `packages/generator`, `evals`) with strict
  TypeScript 6, ESLint guardrails (pure core, deterministic generator), Prettier, Vitest.
- GitHub Actions CI: lint, format, typecheck, docs check, and tests against Postgres 17.
- Docker Compose for Postgres 17 (plus a test database) and Redis 8.
- Prisma 7 schema for every entity in the architecture, with money as `Decimal(14,4)`.
- Append-only `AuditEvent`: a database trigger rejects UPDATE and DELETE.
- Idempotent seed: 1 user, 15 vendors, 200 catalog items.
- Synthetic generator (`pnpm generate`): seeded, byte-deterministic POs, receiving reports,
  and invoices in 6 vendor layouts; 10 planted error types; PNG scans; `ground_truth.json`
  answer keys with field locations and FR-09 exceptions.
- Committed 20-set CI golden subset (`evals/golden-ci`, `pnpm generate:ci`).
- Diagrams rendered to PNG (`pnpm docs:diagrams`) with a CI freshness check.

### Changed
- PRD FR-09: each billed unit is counted once (short-ship vs. billed-not-received).
- M1 AC-12: added the "extra unordered invoice line" planted error.

## [0.1.0] - 2026-10-16

M0: requirements and design. Documentation only, no code.

### Added
- Project context (`CLAUDE.md`) and SDLC process.
- M0 requirements: PRD (12 user stories, 18 functional and 10 non-functional requirements), glossary, backlog, learning log.
- `QTY_BILLED_NOT_RECEIVED` exception type; informational short-ships (PRD decisions Q1, Q2).
- M0 design: architecture doc, ADRs 0001–0006, doc and PR templates.

[Unreleased]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.1.0
