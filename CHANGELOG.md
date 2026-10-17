# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.5.0] - 2026-10-17

M4: Reconcile runs as a backend service ([PR #5](https://github.com/rishabhsrinivasan657-design/reconcile/pull/5)).

### Added
- **Upload API** (`apps/api`, Fastify): upload PDF/PNG/JPEG (duplicates recognized by fingerprint),
  read documents, PO sets, and problems; standard error replies; live manual at `/docs`.
- **Background worker** (`apps/worker`, BullMQ on Redis): "read this document" and "match this PO"
  jobs; one AI speed limit shared by all workers; a 7-day wait before reporting a missing document;
  re-matching creates a new version and carries human decisions over.
- **Shared toolbox** (`packages/pipeline`): storage, upload, read, match, history log.
- **Misread PO numbers** (B-17): a PO number one character off is grouped with the same vendor's PO
  and labeled for review.
- **AI line pairing** (`fuzzy.v1`) with `text`, `llm`, and `hybrid` strategies; `pnpm eval --fuzzy`
  compares them. Hybrid is the default (chosen by the eval).
- Generator 0.5.0: invoices that use the vendor's own product names (no SKU, no brand).
- `pnpm dev` starts the API and the worker together.

### Changed
- `matchDocuments` is asynchronous (so the AI can plug in).
- Database: PO set status, provisional flag, notes, and grace-period end; extraction review fields;
  carried-over exceptions.
- AI answers that stop early keep their complete part.

### Results (CI subset)
- e2e exception precision / recall 100 / 100 (was 84.2 / 94.1); extract field F1 99.8.
- All 20 CI sets through the real API and worker give exactly the eval's answers.

## [0.4.0] - 2026-10-17

M3: LLM client and extraction ([PR #4](https://github.com/rishabhsrinivasan657-design/reconcile/pull/4)).

### Added
- `packages/llm`: LangChain.js providers (Gemini default, Groq, OpenAI, Anthropic, Ollama) behind
  our own client: response cache, replay mode, request and token rate limits, retries (none for
  billing/quota errors), a hard spend cap for paid providers, and an `LlmCall` log (ADR-0010).
- `packages/extraction`: PDF/scan → typed document with per-field confidence and location;
  lenient parsing; money, date, and box normalization; math checks; a self-check retry when lines
  don't add up; review flag; hash-locked prompts (`extract.v2`, `extract.retry.v1`).
- `pnpm extract <file>`: read one document and print fields, confidence, review reasons, cost.
- Eval stages `extract` (field P/R/F1, PDF vs scan, location hit rate, review and catch rate,
  cost, latency) and `e2e` (read → match), replaying recorded answers in CI with no key.
- Generator 0.4.0: reworded SKU-less lines and SKU-less invoices (B-16).

### Changed
- Default LLM: Gemini free tier `gemini-3.5-flash-lite` (after OpenAI had no credit and Groq's
  free vision model capped output). `$0` constraint restored; paid providers stay capped.
- `evals/baseline.json` holds one baseline per stage; CI gates match, extract, and e2e.
- `LlmCall.documentRef` added; `LlmCall.costUsd` nullable.

### Results (CI subset)
- extract: field F1 99.9 (PDF 100.0, scans 99.7); e2e: link F1 97.4, exception P/R 84.2 / 94.1.

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

[Unreleased]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/rishabhsrinivasan657-design/reconcile/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.1.0
