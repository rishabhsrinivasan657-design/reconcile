# Reconcile

An AI "3-way match" agent for distributors and CPG brands. It reconciles
**purchase orders (PO)**, **warehouse receiving reports (RR)**, and **supplier
invoices (INV)**. It flags short-ships, price mismatches, and other exceptions
for a human to **approve, dispute, or write off**.

This is a portfolio project. It should read like production code: small,
well-tested, measurable, and honest about what the AI does and doesn't do.

---

## Hard constraints (do not violate without asking)

1. **$0 to build and run.** Everything runs locally via Docker Compose
   (Postgres, Redis). No paid SaaS, no hosted vector DBs. Paid LLM providers
   (e.g. the owner's OpenAI credit) are optional and guarded by a hard spending
   cap (`LLM_BUDGET_USD`, default 4.00). CI never spends: it replays recorded responses.
2. **LLM = Gemini free tier, `gemini-3.5-flash-lite` by default** (decided
   2026-10-17, after OpenAI had no credit and Groq's free vision model capped
   output at 1K tokens/min), behind a provider interface. Groq, OpenAI,
   Anthropic, and Ollama are supported alternatives. Switch providers with an env var:
   `LLM_PROVIDER=groq|openai|gemini|anthropic|ollama`. Model IDs come from env too
   (`LLM_MODEL_EXTRACT`, `LLM_MODEL_MATCH`). Never hardcode them in logic.
3. **Assume tight rate limits.** Every LLM call goes through the shared
   client, which provides:
   - a queue and concurrency limiter (BullMQ limiter in the worker, plus an
     in-process token bucket for scripts and evals)
   - retry with exponential backoff and jitter on 429/5xx, honoring `Retry-After`
   - a **response cache** keyed by
     `sha256(document bytes) + prompt_version + model + provider`.
     Re-running evals must not spend quota.
4. **TypeScript end to end.** Strict mode, no `any` without a comment saying why.
5. **Tests:** Vitest for units, Playwright for exactly one E2E happy path.
6. **Git hygiene:** one feature per branch/PR, small commits that each build,
   Conventional Commits (`feat(core): …`, `fix(worker): …`, `test(evals): …`).

## Out of scope (for now)

- Auth beyond a single seeded user (no signup, no RBAC)
- Payments, Shopify/Stripe integrations (later milestones)
- Cloud deployment. This is the **last** milestone: Terraform to the AWS free plan.

If a task seems to need any of these, stop and ask.

---

## Monorepo layout (pnpm workspaces)

```
apps/
  web/        Next.js (App Router) UI: upload, review queue, exceptions, audit
  api/        Fastify REST API: uploads, documents, matches, exceptions, actions
  worker/     BullMQ worker: extract → validate → group → match jobs
packages/
  db/         Prisma schema, migrations, seed (single user), client export
  core/       Zod schemas and shared types, matching engine, LLM client and providers
  mcp/        MCP server (official @modelcontextprotocol/sdk), read-only tools
  generator/  Synthetic PO/RR/INV PDF generator with ground truth
evals/        Eval harness, golden dataset, baseline.json, results/
docker-compose.yml   postgres, redis (app services optional/profiled)
```

Dependency direction: `apps/* → packages/core, packages/db`. `packages/core`
must not import `db`, Fastify, Next, or BullMQ. It stays pure and unit-testable.
The matching engine is a pure function: `(po, rr, inv[], config) → MatchResult`.

## Core flow

1. **Upload** a PDF or image (PO, RR, or invoice). Store it on the local
   filesystem behind a `Storage` interface so S3 can be swapped in later.
   Record its sha256 to detect re-uploads.
2. **Extract** (worker job). The LLM returns a typed schema: vendor, doc type,
   doc number, PO reference, dates, currency, line items (SKU, description,
   qty, UOM, unit price, line total), and totals (subtotal, tax, shipping, total).
   - Every field has `{ value, confidence (0–1), source: { page, bbox? } }`.
   - Validate with Zod. Then run **deterministic consistency checks**:
     qty × unit price ≈ line total, Σ lines ≈ subtotal, subtotal + tax +
     shipping ≈ total, and dates that parse. A failed check lowers the confidence
     of the fields involved. (LLM self-reported confidence is poorly calibrated,
     so don't trust it alone.)
   - A field below threshold or failing validation sends the document to the
     **review queue** before it can be matched.
3. **Match.** Group documents by PO number. Then match line items:
   1. exact SKU (after normalization: case, whitespace, leading zeros)
   2. qty within tolerance
   3. unit price within tolerance (abs and/or %)
   4. **LLM fallback only for leftover lines**: fuzzy description matching.
      It must return `{ matched_line_id | null, confidence, reasoning }`.
      The reasoning is stored and shown in the UI.
   Tolerances live in config (per vendor overrides later), not code.
4. **Exceptions.** Types: `SHORT_SHIP`, `OVER_SHIP`, `PRICE_VARIANCE`,
   `QTY_BILLED_NOT_RECEIVED`, `MISSING_DOCUMENT`, `DUPLICATE_INVOICE`,
   `UNMATCHED_LINE`. A short-ship that's billed correctly is *informational*
   ($0 AP impact). Exact rules live in `docs/prd.md` FR-09.
   Each has a dollar impact and links to the lines and docs involved.
   A human can **approve / dispute / write off** with a required note.
   Duplicate-invoice detection is deterministic (vendor + invoice number,
   with a fallback to vendor + total + date window).
5. **Audit log.** Append-only. Every state change and human action writes an
   `AuditEvent` (actor, action, entity, before/after JSON, timestamp).
   This is enforced in Postgres with a trigger that rejects UPDATE/DELETE on the
   table, not just by convention.
6. **MCP server**, read-only tools: `list_exceptions`, `explain_match`,
   `find_short_shipments(date_range)`, `get_audit_trail(po_number)`.

## Data model (sketch; the Prisma schema is the source of truth)

`User`, `Vendor`, `CatalogItem`, `Document` (type, sha256, storage path,
status), `Extraction` (document, prompt version, model, raw JSON, validated
JSON, field confidences), `DocumentSet` (PO number), `LineMatch` (method:
`SKU|FUZZY_LLM|MANUAL`, reasoning), `Exception` (type, status, amount),
`ExceptionAction`, `AuditEvent`, `LlmCall`.

**Money:** never use JS floats for money. Use Prisma `Decimal` in the DB and
`decimal.js` (or integer minor units) in `core`. Zod schemas parse money from
strings or numbers into the decimal type.

## LLM client rules

- One interface: `LlmProvider.generateStructured({ schema, prompt, images?,
  promptVersion })`. Providers: Gemini (default), Ollama, Anthropic, OpenAI.
  Each lives in its own file and is selected by env.
- Prompts are versioned files (`packages/core/src/prompts/extract.v1.ts`).
  Bump the version on any change, since the version is part of the cache key.
- **Log every call** to `LlmCall`: provider, model, prompt version, purpose
  (extract/fuzzy_match), document id, latency ms, input/output tokens,
  cache hit, estimated cost (from a price table in config, at list price even
  on the free tier, so cost per document can be shown), and error, if any.
- Evals and CI can run in **replay mode** from a committed cache
  (`evals/cache/`), so PR CI needs no API key unless a prompt version changed.

## Synthetic data generator (`packages/generator`)

- **Seeded and deterministic.** The same seed produces byte-identical PDFs:
  fixed PDF metadata dates, no `Date.now()`, seeded PRNG everywhere. Document
  hashes must be stable or the cache breaks.
- Fake catalog of ~200 SKUs across ~15 vendors. Each vendor has its own
  template: layout, open-licensed font, column order, date format, header
  wording ("Qty Shipped" vs "Units"), SKU format.
- Injects discrepancies at configurable rates: short-ship, over-ship, price
  change, description typos and abbreviations, SKU omitted on invoice,
  missing doc, duplicate invoice.
- Some outputs are rasterized to PNG with slight rotation and noise to mimic
  scans.
- Writes `ground_truth.json` per set: the canonical field values for each
  doc, the expected line matches, the expected exceptions (type, lines, amount),
  and the bboxes of the rendered fields (we know where we drew them).
- Golden set: ~100 sets. CI subset: a fixed list of 20 set IDs.

## Evals (non-negotiable)

- `pnpm eval` runs the harness, prints a summary table, and writes
  `evals/results/<timestamp>.json`.
- Metrics:
  - extraction: field-level precision/recall (and per-field breakdown)
  - matching: line-match accuracy
  - exceptions: precision/recall per type
  - ops: p50/p95 latency, tokens, and est. cost per document
- In M2, `pnpm eval` scores matching on perfect extractions (answer-key values),
  separating matching errors from extraction errors. `--subset ci|full`, `--dir`.
- `evals/baseline.json` is committed. GitHub Actions runs the 20-set subset on
  every PR and **fails if any metric drops more than 2 percentage points**
  versus the baseline. Updating the baseline is a deliberate commit with a
  reason in its message.

## Conventions

- Node LTS, pnpm, ESM. Lint with ESLint and format with Prettier.
- Diagrams: Mermaid source in a collapsed `<details>` block plus a rendered
  PNG in `docs/diagrams/`, so they show in every viewer. Re-render after edits.
- Validate env with Zod at startup (`packages/core/src/env.ts`).
  `.env.example` lists every var. Never commit secrets.
- API: JSON, Zod-validated request/response, OpenAPI generated from the schemas.
- Worker jobs are idempotent (keyed by document sha256 + prompt version).
- Prefer deterministic code over LLM calls whenever a rule can do the job.
  The LLM handles reading documents and fuzzy judgment, nothing else.

## Commands

```
corepack enable && pnpm install   # also runs prisma generate
docker compose up -d               # postgres + redis (POSTGRES_PORT to override 5432)
pnpm db:migrate | db:seed | db:reset
pnpm generate --seed 42 --sets 100 --out evals/golden
pnpm generate:ci                   # rebuild committed evals/golden-ci (20 sets)
pnpm lint | typecheck | test | format
pnpm docs:diagrams | docs:check
pnpm eval [--stage match|extract|e2e|all] [--check-baseline | --update-baseline]
pnpm eval:record                   # live LLM run on the CI subset (writes evals/cache)
pnpm extract <file.pdf|png>        # read one document with the LLM
# later: pnpm dev, pnpm test:e2e
```

Toolchain pins: TypeScript 6.0 (typescript-eslint doesn't support 7), Prisma 7.10 (npm
`latest` is an 8.0 RC), pnpm 10 via Corepack.

## Development process (SDLC)

The project follows an explicit SDLC. The owner is also using it to **learn**,
so every phase produces a written artifact and ends at a gate the owner approves.
Never skip a phase or merge two phases into one step without asking.

### Phases per milestone

| # | Phase | Artifact (in `docs/`) | Gate: owner approves… |
|---|-------|------------------------|------------------------|
| 1 | **Requirements** | `milestones/Mx/requirements.md`: user stories, acceptance criteria, non-goals | the scope |
| 2 | **Design** | `milestones/Mx/design.md`: components, data flow, schema/API changes, risks. Plus an ADR in `adr/` for every significant decision | the approach |
| 3 | **Implementation** | Feature branch, small Conventional Commits, opened as a draft PR | (no gate; work happens on the branch) |
| 4 | **Testing / verification** | `milestones/Mx/test-plan.md` (written in phase 2, executed here): unit/E2E tests, eval results vs baseline, manual demo steps | the test and eval results |
| 5 | **Review** | PR description: what changed, why, how to demo, test/eval output; self-review checklist completed | the merge |
| 6 | **Release** | Tag `vX.Y.0`, `CHANGELOG.md` entry, demo script/GIF in `milestones/Mx/demo.md` | the release |
| 7 | **Retrospective** | `milestones/Mx/retro.md`: what went well, what didn't, lessons, follow-ups into the backlog | (no gate; this feeds the next milestone's Requirements) |

Bugs found after a release go through a lighter loop (issue → fix branch →
test → PR → patch tag) and are recorded in `CHANGELOG.md`. That is the
**maintenance** phase.

### Project-level docs (written once, kept current)

- `docs/prd.md`: product requirements (problem, users, goals, non-goals, success metrics)
- `docs/architecture.md`: system context and container diagrams (Mermaid), data flow, deployment view
- `docs/adr/NNNN-title.md`: Architecture Decision Records (context → options → decision → consequences)
- `docs/backlog.md`: prioritized backlog, deferred ideas, and known tech debt
- `docs/glossary.md`: domain terms (3-way match, short-ship, deduction, UOM…)
- `docs/learning-log.md`: one entry per phase saying what concept was practiced and why it matters in industry
- `CHANGELOG.md`: Keep a Changelog format with SemVer

### Rules for Claude

- At the start of each phase, say which phase it is and what artifact it will
  produce. At the end, summarize and **stop for the gate**. Don't start the
  next phase until the owner approves.
- Explain the *why* of each phase and each decision briefly, in plain language.
  The owner is learning, so teach without lecturing.
- Requirements and design docs come **before** code on the branch. Code that
  doesn't trace back to a requirement or acceptance criterion doesn't belong in the PR.
- A scope change found mid-milestone goes into `backlog.md` or back to the
  Requirements gate. It never gets silently absorbed.
- Keep docs short: a page per artifact is usually enough. Use templates in
  `docs/templates/`.

## Writing style (all docs and messages)

The owner is building a project like this for the first time. Everything written
for people (milestone docs, README, ADRs, learning log, PR descriptions, chat)
uses **plain, everyday language**:

- Say what something does and why it matters *before* any technical term.
- Define a technical word in a few plain words the first time it appears.
- Short sentences. Examples and analogies help. Avoid acronyms where a word works.
- Keep IDs like AC-1 or FR-09 (they link docs together), but always describe them in words.
- Concise, but don't drop information. Code comments can stay technical.

## Working agreement with Claude

- Follow the SDLC gates above, and stop at each one for review.
- Each PR: what changed, how to demo it, test/eval output.
- Don't add dependencies that need paid accounts or network calls at build time.
