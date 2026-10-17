# M2: Matching engine and eval harness. Requirements

- **Status:** Draft, awaiting approval at the M2 Requirements gate
- **PRD links:** US-02, US-06 · FR-06, FR-07, FR-09, FR-10, FR-16, FR-17 · NFR-05, NFR-09, NFR-10
- **Target release:** v0.3.0

## Goal

Given the documents of a set (PO, receiving report, invoices), Reconcile
decides which lines belong together and which exceptions to raise, with the
dollar amount and a reason for each. A single command, `pnpm eval`, scores
those decisions against the M1 answer keys, and CI blocks any change that makes
the scores worse.

M2 uses **perfect inputs** (the answer key's field values) instead of reading
documents, so matching quality is measured on its own, before the LLM
extraction of M3 adds its own errors. **No LLM, no API key, no quota.**

## User stories in scope

| ID | Story |
|---|---|
| US-06 | As an AP clerk, I want documents grouped by PO and lines matched automatically, so that I only look at what doesn't match. |
| US-02 | As a developer, I want one command that evaluates matching and exception detection, so that I know whether a change made things better or worse. |

## Acceptance criteria

### A. Matching engine (`packages/core`)

- [ ] **AC-1 Input shape.** A Zod schema for an *extracted document* (field
  values, no locations) lives in `core`. M3's LLM extraction will produce this
  same shape. An adapter turns any answer-key document into it.
- [ ] **AC-2 Grouping.** Given a mixed pile of documents from many sets, the
  engine groups them by PO number (the PO's own number; the RR's and invoices'
  PO reference). Documents whose PO reference matches no group still form a
  group, so a missing PO is detected.
- [ ] **AC-3 Line matching, rules first.** Within a group, lines are paired by
  normalized SKU (case, spaces, dashes, leading zeros). Lines left over go to a
  **fuzzy matcher** passed in as a function (ADR-0003). Every pair records how
  it was made (`SKU` / `FUZZY`) and, for fuzzy pairs, a confidence and a reason.
- [ ] **AC-4 Exceptions.** All 7 exception types from PRD FR-09, implemented
  **independently** of the generator's answer-key code (ADR-0008). That includes
  count-once dollar impacts, informational flags, and the incomplete-set rule (a
  set missing a document reports only `MISSING_DOCUMENT`).
- [ ] **AC-5 Tolerances.** Quantity and price tolerances (absolute and %) come
  from a config object with defaults (qty: exact; price: the larger of $0.01 and
  0.5%). A difference inside tolerance raises nothing.
- [ ] **AC-6 Duplicates.** A duplicate invoice is detected by same vendor and
  invoice number, or by same vendor and same total within a configurable date
  window. Its lines are not matched a second time.
- [ ] **AC-7 Explanations.** Every exception carries a plain-English
  explanation built from the numbers, e.g. "Ordered 48, received 38, billed 48
  at $232.97: billed for 10 units that never arrived ($2,329.70)."
- [ ] **AC-8 Pure and fast.** `match()` does no I/O and is deterministic. It
  matches a set in under 200 ms, excluding any LLM (NFR-09).
- [ ] **AC-9 Unit tests** cover every exception type, both sides of every
  tolerance edge, the count-once worked example ($11.60), grouping with a missing
  PO, and both duplicate rules.

### B. Eval harness (`evals/`)

- [ ] **AC-10 Command.** `pnpm eval` runs on the committed CI subset by default.
  `--subset full` runs on `evals/golden` after it's generated. The command prints
  a summary table and writes `evals/results/<timestamp>.json`.
- [ ] **AC-11 Metrics.** The harness reports:

  | Metric | Definition |
  |---|---|
  | Grouping accuracy | Share of documents placed in the correct set |
  | Line-match precision / recall / F1 | Over pairwise links (PO–RR, PO–invoice, RR–invoice) compared with the answer key |
  | Exception precision / recall / F1 | Overall and per type. A predicted exception counts as correct when its type, set, and lines (or documents) match the answer key. |
  | Amount accuracy | Share of correctly detected exceptions whose dollar amount and informational flag match to the cent |
  | Latency | p50 / p95 time per set |

- [ ] **AC-12 Baseline gate.** `evals/baseline.json` is committed.
  `pnpm eval --check-baseline` exits with an error if any quality metric is
  **more than 2 percentage points** below the baseline (FR-17).
  `pnpm eval --update-baseline` rewrites it, which is a deliberate commit with a reason.
- [ ] **AC-13 CI.** A new CI job runs the eval on the CI subset with
  `--check-baseline` on every PR. A deliberately worsened PR is shown failing,
  then closed. This also closes M1's AC-4 red-path gap.
- [ ] **AC-14 Targets.** On perfect inputs, M2 meets the PRD's targets:
  line-match F1 ≥ 0.98, exception precision ≥ 0.90, exception recall ≥ 0.95.
  Any metric that misses is reported honestly, with the reason, not tuned away.

### C. Docs

- [ ] **AC-15** The README covers `pnpm eval` with a sample scoreboard. The
  glossary covers the new terms (precision/recall over links, baseline gate).

## Out of scope

- Reading documents with an LLM (M3). The LLM fuzzy matcher (M4). Database
  persistence of matches, API, and UI (M4–M5).
- Retailer deductions (B-01), multiple receiving reports per PO (B-02), UOM conversion (B-03).

## Assumptions

- "Grace period passed" for missing documents: the eval treats every set as past
  its grace period. A real date-based grace period arrives with the worker (M4).
- Exceptions are compared one per type per line. Document-level exceptions
  (missing, duplicate) are compared by the documents involved.

## Open questions (need your answer at this gate)

- **Q1. Fuzzy matching before the LLM.** Lines with no SKU (`sku_omitted`) can
  only be paired by description. Until the LLM matcher arrives in M4, should M2
  include a simple **non-AI text-similarity matcher**?
  - *Recommended: yes.* It's free and deterministic, and it gives a baseline
    score. In M4, the LLM gets measured against it, which shows exactly what
    the AI adds.
  - *Alternative:* leave those lines unmatched until M4. Scores will be lower in
    M2, and the matching false alarms show up as `UNMATCHED_LINE`.
- **Q2. Protect `main` (backlog B-13).** Turn on a GitHub rule that blocks
  merging into `main` unless CI passes? *Recommended: yes.* It's a repo
  setting, so I'll only change it with your OK at this gate.
- **Q3. Near-miss noise (backlog B-15).** Add a new planted "noise" type to the
  generator: price differences *inside* tolerance (e.g. 5¢ on a $30 item) that
  must **not** raise an exception. This tests precision and tolerances properly.
  - *Recommended: yes.* It needs a generator change and a regenerated CI subset,
    released as part of v0.3.0.
