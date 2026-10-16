# ADR-0008: Build the answer key from planted errors; curated data instead of Faker

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16
- **Requirements:** FR-09, FR-15, NFR-05 · M1 AC-10, AC-12, AC-13

## Context
The answer key (`ground_truth.json`) is what every metric is measured
against. If it's wrong, every metric is wrong. It must also be reproducible
forever from a seed.

## Options
1. Generate documents, then run the matching engine to label them. Fast to
   build, but it **grades the matcher against itself**: its bugs become "truth."
2. **Record each planted error as it's applied, and derive the expected
   matches and exceptions from those records** using the impact rules in the
   M1 design §6.5.
3. Data source: **Faker** (big, easy) vs. **curated word lists** (small, under our control).

## Decision
Option 2, with curated lists. The generator plants errors explicitly
(`PlantedError` records) and a separate truth builder converts them to the
expected exceptions with dollar impacts. The matching engine (M2) is written
independently from the PRD rules and checked against this. Catalog, names,
and addresses come from curated lists in the repo. There's no Faker, since
its output can change between versions.

## Consequences
- ➕ The answer key is independent of the system under test.
- ➕ Reproducible forever. Realism (CPG names, pack sizes, prices) is under our control.
- ➖ Two implementations of the impact rules (truth builder and M2 engine).
  That's intentional: disagreements expose bugs in one of them.
- ➖ The curated lists take some effort to write. About 200 SKUs is small enough.
