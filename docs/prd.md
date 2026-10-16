# Reconcile: Product Requirements Document

| | |
|---|---|
| Status | **Approved** at the M0 Requirements gate (2026-10-16) |
| Owner | Rishabh Srinivasan |
| Last updated | 2026-10-16 |

## 1. Problem

Distributors and CPG brands pay suppliers against three documents that rarely
agree: what they **ordered** (purchase order), what actually **arrived**
(warehouse receiving report), and what they're **billed** (supplier invoice).
Accounts-payable (AP) teams reconcile these by hand, line by line. That is
slow, and mistakes leak money in both directions: paying for goods that never
arrived, or missing price creep.

Most lines match cleanly. The value is in surfacing the few that don't,
explaining *why*, and letting a human decide quickly with a full audit trail.

## 2. Users

| Persona | Goal | Pain today |
|---|---|---|
| **AP clerk** (primary) | Pay correct invoices fast; resolve exceptions | Re-keys data from PDFs, compares three docs by eye |
| **AP / Ops manager** | Know where money is leaking; trust the process | No visibility into exception trends or who approved what |
| **Auditor** (read-only) | Verify every payment decision is justified | Decisions live in email threads and spreadsheets |
| **AI assistant via MCP** | Answer questions like "what was short-shipped last week?" | No structured, safe read access |

The project ships with **one seeded user** who acts as the AP clerk and manager.

## 3. Goals and non-goals

**Goals**
- G1. Turn PO, RR, and invoice PDFs and images into validated, typed data,
  with a confidence score and source location for every field.
- G2. Match the three documents and their line items automatically, with
  deterministic rules first and the LLM only for fuzzy descriptions.
- G3. Raise exceptions with a dollar impact and a plain-language explanation.
- G4. Let a human approve, dispute, or write off each exception, with every
  action in an append-only audit log.
- G5. Prove quality with automated evals against labeled synthetic data, and
  gate every PR on them.
- G6. Cost $0 to build and run, with cost and latency visible per document.

**Non-goals (this version)**
- Multi-user auth, roles, multi-tenancy
- Actually paying invoices, or ERP/accounting integrations (Shopify, Stripe,
  QuickBooks…)
- Real customer documents (synthetic only)
- Retailer deductions processing. It's planned for later, see `backlog.md` and §9 A1.
- Cloud hosting before the final milestone

## 4. User stories

IDs are stable. Design docs, tests, and PRs reference them.

| ID | As a… | I want to… | So that… | Milestone |
|---|---|---|---|---|
| US-01 | developer | generate realistic PO/RR/INV document sets with known errors and ground truth | I have demo data and an eval golden set | M1 |
| US-02 | developer | run one command to evaluate extraction, matching, and exception detection | I know if a change made things better or worse | M2, M3 |
| US-03 | AP clerk | upload a PO, receiving report, or invoice as PDF or image | it gets read without manual data entry | M4, M5 |
| US-04 | AP clerk | see extracted fields highlighted on the original document | I can trust or correct them quickly | M5 |
| US-05 | AP clerk | review only the fields the system is unsure about | I don't re-check everything | M3, M5 |
| US-06 | AP clerk | have documents grouped by PO and lines matched automatically | I only look at what doesn't match | M2, M4 |
| US-07 | AP clerk | see a queue of exceptions with type, dollar impact, and explanation | I work on the costliest problems first | M5 |
| US-08 | AP clerk | approve, dispute, or write off an exception with a note | the decision is recorded and the PO can close | M5 |
| US-09 | auditor | see the full history of a PO: uploads, extractions, matches, decisions | I can verify every decision | M5, M6 |
| US-10 | manager | see LLM cost and latency per document | I know what the automation would cost at list price | M3, M5 |
| US-11 | AI assistant user | ask an MCP client about exceptions, matches, short-shipments, and audit trails | I get answers without opening the app | M6 |
| US-12 | developer | deploy a demo to AWS with one command and tear it down cleanly | I can share a live link at $0 | M7 |

## 5. Functional requirements

**Ingestion and extraction**
- FR-01. Accept PDF, PNG, and JPEG uploads up to 10 MB. Detect exact duplicates by sha256.
- FR-02. Classify document type (PO / RR / INV). The user can override it.
- FR-03. Extract: vendor, doc number, PO reference, dates, currency, line items
  (SKU, description, qty, UOM, unit price, line total), and totals (subtotal,
  tax, shipping, total).
- FR-04. Every extracted field carries a confidence score (0–1) and a source (page, optional bbox).
- FR-05. Validate with schemas and arithmetic checks (qty × price, line sum,
  totals). A failing or low-confidence field puts the document in a review
  state, and it isn't matched until the field is resolved.

**Matching and exceptions**
- FR-06. Group documents by PO number. Report missing members of a set.
- FR-07. Match lines by SKU first, then check qty and price against
  configurable tolerances.
- FR-08. For lines left unmatched, use an LLM fuzzy description match that
  returns a candidate, a confidence, and reasoning. Store the reasoning.
- FR-09. Raise these exceptions:

  | Type | Rule (tolerances configurable) |
  |---|---|
  | `SHORT_SHIP` | received qty < ordered qty. If the invoice bills only what was received, it's flagged *informational* with $0 AP impact (still a supplier-performance signal). |
  | `OVER_SHIP` | received qty > ordered qty |
  | `PRICE_VARIANCE` | invoice unit price ≠ PO unit price |
  | `QTY_BILLED_NOT_RECEIVED` | invoice qty > received qty. Impact = (billed − received) × invoice unit price. |
  | `MISSING_DOCUMENT` | a set lacks PO, RR, or invoice after a grace period |
  | `DUPLICATE_INVOICE` | same vendor + invoice number, or same vendor + total within a date window |
  | `UNMATCHED_LINE` | a line on one document has no counterpart after all matching steps |

- FR-10. Each exception records its dollar impact, the lines and documents
  involved, and a human-readable explanation.

**Human review and audit**
- FR-11. Exception actions: approve, dispute, write off. A note is required.
- FR-12. Every state change and human action is written to an append-only
  audit log that the database itself enforces.

**Interfaces**
- FR-13. REST API with OpenAPI docs covering everything the UI does.
- FR-14. MCP server with read-only tools: `list_exceptions`, `explain_match`,
  `find_short_shipments(date_range)`, `get_audit_trail(po_number)`.

**Data and evals**
- FR-15. Seeded generator: ~200 SKUs, ~15 vendors, varied layouts and fonts,
  configurable discrepancy rates, and `ground_truth.json` per set.
- FR-16. `pnpm eval` reports extraction field P/R, match accuracy, exception
  P/R, and latency, tokens, and cost. It writes results JSON.
- FR-17. CI runs evals on a fixed 20-set subset and fails if any metric drops
  more than 2 percentage points from the committed baseline.
- FR-18. Every LLM call is logged: provider, model, prompt version, purpose,
  latency, tokens, cache hit, estimated cost, and error.

## 6. Non-functional requirements

| ID | Requirement |
|---|---|
| NFR-01 Cost | $0 to build and run locally. No paid services. |
| NFR-02 Portability | `docker compose up` plus documented `pnpm` commands work on a clean macOS/Linux machine. |
| NFR-03 Rate limits | The system works within Gemini free-tier limits: queueing, backoff, and a response cache keyed by doc hash + prompt version + model. |
| NFR-04 Swappable LLM | A provider is chosen by env var (Gemini, Ollama, Anthropic, OpenAI) with no code changes. |
| NFR-05 Determinism | The generator is byte-reproducible from a seed. Matching is a pure function. |
| NFR-06 Auditability | The audit log can't be modified or deleted, even via direct SQL by the app role. |
| NFR-07 Correctness | No floating-point money. Decimal types end to end. |
| NFR-08 Quality | Strict TypeScript. Unit tests on `core`. One Playwright E2E. Lint and typecheck in CI. |
| NFR-09 Performance | Matching a set: < 200 ms excluding LLM. Extraction: no hard target (free tier), but measured and reported. |
| NFR-10 Explainability | Every match and exception can explain itself: the rule path or the LLM reasoning. |

## 7. Success metrics

These are initial targets, to be calibrated after the first real run (M3).
The CI gate protects against **regression from baseline**, not these absolute numbers.

| Metric | Target |
|---|---|
| Extraction field F1, clean PDFs | ≥ 0.95 |
| Extraction field F1, scanned images | ≥ 0.85 |
| Line-match accuracy (from ground truth) | ≥ 0.98 |
| Line-match accuracy (end to end) | ≥ 0.90 |
| Exception detection precision / recall | ≥ 0.90 / ≥ 0.95 (missing an exception costs more than a false alarm) |
| Estimated cost per document set (list price) | reported; target < $0.01 |
| Golden-set eval run with warm cache | 0 API calls |

## 8. Constraints

TypeScript pnpm monorepo (Next.js, Fastify, BullMQ, Prisma/Postgres, Redis),
Docker Compose, Vitest + Playwright, GitHub Actions, and Gemini free tier by
default. See `CLAUDE.md` for full detail.

## 9. Assumptions (confirmed 2026-10-16)

| # | Assumption | If wrong… |
|---|---|---|
| A1 | **Retailer deductions** are out of scope for M0–M7. The data model leaves room for a `DEDUCTION` document and exception type, and the backlog holds it. | Add it as a milestone after M5 |
| A2 | CI runs evals in **replay mode** from a committed LLM cache. A `GEMINI_API_KEY` repo secret is needed only when a prompt version changes. | CI would need a key on every PR and spend quota |
| A3 | Commit PDFs and ground truth for the **20-set CI subset** only. The full ~100 sets are regenerated from the seed. | Repo grows by ~20–40 MB |
| A4 | A local git repo for now. The GitHub remote is added before M1's first PR (needed for Actions). | n/a |
| A5 | Single currency (USD) and single UOM per line ("each" or "case"). No UOM conversion. | UOM conversion becomes its own feature |
| A6 | One PO has one receiving report and one or more invoices. Partial receipts across multiple RRs are deferred. | Matching must aggregate across RRs |

## 10. Decisions log

| # | Question | Decision (2026-10-16) |
|---|---|---|
| Q1 | Should we flag being billed for goods that never arrived? | Yes: new exception type `QTY_BILLED_NOT_RECEIVED` (FR-09) |
| Q2 | Does a short-ship that's billed correctly still count? | Yes, raised as *informational* with $0 AP impact (FR-09) |

## 11. Risks

| Risk | Mitigation |
|---|---|
| Free-tier quota or model changes | Provider interface, response cache, Ollama fallback, replay-mode CI |
| Synthetic docs too easy, so evals look great but mean little | Vary layouts and fonts, add scan noise, abbreviations, and typos. Report clean vs. scan metrics separately. |
| LLM confidence poorly calibrated | Arithmetic and schema checks adjust confidence. Measure calibration in evals. |
| Scope creep in a portfolio project | SDLC gates and `backlog.md`. Each milestone is shippable alone. |
| AWS "free" deploy incurs cost | Single small instance, budget alarm, documented `terraform destroy` (M7) |

## 12. Traceability

| Milestone | Stories | Key FRs / NFRs |
|---|---|---|
| M0 Requirements and design | n/a | PRD, architecture, ADRs |
| M1 Foundation and synthetic data | US-01 | FR-15, NFR-02, NFR-05, NFR-06 (trigger) |
| M2 Matching engine and eval harness | US-02, US-06 | FR-06, FR-07, FR-09, FR-10, FR-16, FR-17 |
| M3 LLM client and extraction | US-02, US-05, US-10 | FR-02–FR-05, FR-18, NFR-03, NFR-04 |
| M4 API, worker, fuzzy fallback | US-03, US-06 | FR-01, FR-08, FR-13 |
| M5 Web UI and human-in-the-loop | US-04, US-05, US-07–US-10 | FR-11, FR-12 |
| M6 MCP server | US-09, US-11 | FR-14 |
| M7 Deploy | US-12 | n/a |
