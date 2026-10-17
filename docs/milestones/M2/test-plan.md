# M2: Matching engine and eval harness. Test plan

Written in the Design phase and executed in the Testing phase.

## Coverage map

| AC | How it's verified | Type | Result |
|---|---|---|---|
| AC-1 Input shape | Every answer-key document in the CI subset converts and parses with `ExtractedDocument` | unit | ✅ All CI-subset docs convert via `fromTruthDocument` and parse (`loadSubset`, used by every eval and test) |
| AC-2 Grouping | Mixed pile of 3 sets regroups exactly; an RR + invoice without a PO form their own group with `MISSING_DOCUMENT`; grouping accuracy = 100 on the CI subset | unit + eval | ✅ Unit tests: regrouping a mixed pile, missing PO → only `MISSING_DOCUMENT`, missing invoice informational, unassigned docs. Grouping = 100 on CI, full, and stress sets. |
| AC-3 Line matching | SKU normalization cases (`sp-0123` = `SP123`); a fuzzy pair is accepted above and rejected below the threshold; one-to-one assignment; method/confidence/reason recorded | unit | ✅ SKU normalization cases; a SKU-less line paired by description with confidence > 0.75 and a reason; a different size or conflicting SKU is not paired and becomes `UNMATCHED_LINE` |
| AC-4 Exceptions | One test per FR-09 row, incl. count-once ($11.60 example), the over-ship + billed-beyond-received split, the incomplete-set rule, informational flags | unit | ✅ One test per FR-09 row, incl. $11.60 and the over-ship + billed-beyond split. Incomplete-set rule covered. |
| AC-5 Tolerances | Price at exactly the tolerance → no exception; 1¢ beyond → `PRICE_VARIANCE`; qty tolerance configurable; custom config respected | unit | ✅ $30.00 vs $30.15 → none; $30.16 → $1.60 variance; the $0.01 floor; configurable qty tolerance |
| AC-6 Duplicates | Same vendor + number → duplicate; same vendor + total within the window → duplicate; outside the window → not; duplicate lines unmatched | unit | ✅ Same number; same total within 45 days; outside the window → not a duplicate; duplicate lines never matched |
| AC-7 Explanations | Snapshot of one explanation per type; amounts in the text equal the `amount` field | unit | ✅ Exact sentence asserted for the short-ship case; amount in the text = `amount` field |
| AC-8 Pure and fast | No I/O imports in `matching/` (lint); same input → identical output; p95 per group < 200 ms in the eval | unit + eval | ✅ No I/O imports (lint); determinism test; p95 0.13 ms per set (budget 200 ms) |
| AC-9 Unit test coverage | All of the above present; `pnpm test` green | unit | ✅ 24 matcher tests plus the import-ban test; `pnpm test` 86/86 green |
| AC-10 Command | `pnpm eval` and `--subset full` both print the scoreboard and write a results JSON | manual | ✅ `pnpm eval`, `--subset full`, and `--dir` all print the scoreboard and write results JSON |
| AC-11 Metrics | Scorer unit tests on hand-made predictions: perfect → 100; one missing link → recall drops by the exact amount; wrong amount → amount accuracy drops | unit | ✅ `score.test.ts`: perfect → 100; one dropped match → recall falls by exactly 3 pairs; a wrong amount lowers amount accuracy only; a swapped type → one FP and one FN |
| AC-12 Baseline gate | Unit: a 2.1-point drop fails, 2.0 passes, a rise passes; `--update-baseline` rewrites the file | unit | ✅ −2.0 passes, −2.1 fails, a rise passes, no baseline never fails. Local run with a broken tolerance: `✗ exception recall (−11.76)`. |
| AC-13 CI | Eval job green on the M2 PR; a throwaway PR with a broken threshold shows it red (link recorded), then is closed | CI | ⏳ Eval job added. PR #2 (real) and throwaway PR #3 (tolerance loosened to 20%) are running. Result recorded at the Testing gate. |
| AC-14 Targets | Link F1 ≥ 98, exception P ≥ 90, R ≥ 95 on CI subset and full set; misses listed with reasons | eval | ✅ 100.0 on every metric: CI subset (20 sets), full (100 sets), stress runs of 200 sets for seeds 7, 99, 2026. ⚠️ Inflated by easy fuzzy cases (backlog B-16). |
| AC-15 Docs | README eval section with a real scoreboard; glossary terms; `docs:check` passes | manual + CI | ✅ README eval section with a real scoreboard; glossary (link, baseline gate, near miss); `docs:check` passes |
| AC-16 Price noise | Rate 1.0 alone plants it in every set and expects no exception; delta always within tolerance; CI subset has ≥ 2; matcher raises nothing for them (per-type FP = 0) | unit + eval | ✅ Rate 1.0 alone → planted in every set, always 1¢ to tolerance, no exception expected. CI subset has 4 noise lines; matcher FP = 0. |

## Eval impact
This milestone **creates** the first baseline. Expected: grouping 100, high link
and exception scores, with the remaining misses in fuzzy pairs (SKU-less lines
with heavy abbreviations).

## Manual demo steps
1. `pnpm eval`, then read the scoreboard and per-type table.
2. Open the newest `evals/results/*.json` and look at any false positive or negative with its explanation.
3. `pnpm generate` (100 sets), then `pnpm eval --subset full`.

## Results summary

Executed 2026-10-17.

- **15 of 16 criteria pass; AC-13 is waiting on CI** (see the PR checks).
- `pnpm test`: 13 files, 86 tests, all green. The eval is **100.0** on every metric, on every set tried (20 + 100 + 3×200).
- Regenerating the CI subset from a fresh clone gives **0 changed files**. The baseline gate passes there.
- **Finding 1, fixed during implementation:** the first eval run showed link recall 95.5, because
  incomplete sets weren't line-linked. Fixed in `fix(core): link lines in incomplete sets too`. That's
  the harness doing its job on day one.
- **Finding 2, logged as B-16, not fixed here:** the perfect scores are partly because the generator
  never combines a missing SKU with a garbled description, so the fuzzy step only sees easy text.
  This matters for M4 (AI vs. baseline). It's a candidate for M3/M4 scope.
- **Deviation:** `generate:ci` now draws its 20 sets from a pool of 200 (was 100), so rare types
  (duplicates) still appear twice after adding `price_noise`.
