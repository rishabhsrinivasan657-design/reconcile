# M2: Matching engine and eval harness. Test plan

Written in the Design phase and executed in the Testing phase.

## Coverage map

| AC | How it's verified | Type | Result |
|---|---|---|---|
| AC-1 Input shape | Every answer-key document in the CI subset converts and parses with `ExtractedDocument` | unit | ⬜ |
| AC-2 Grouping | Mixed pile of 3 sets regroups exactly; an RR + invoice without a PO form their own group with `MISSING_DOCUMENT`; grouping accuracy = 100 on the CI subset | unit + eval | ⬜ |
| AC-3 Line matching | SKU normalization cases (`sp-0123` = `SP123`); a fuzzy pair is accepted above and rejected below the threshold; one-to-one assignment; method/confidence/reason recorded | unit | ⬜ |
| AC-4 Exceptions | One test per FR-09 row, incl. count-once ($11.60 example), the over-ship + billed-beyond-received split, the incomplete-set rule, informational flags | unit | ⬜ |
| AC-5 Tolerances | Price at exactly the tolerance → no exception; 1¢ beyond → `PRICE_VARIANCE`; qty tolerance configurable; custom config respected | unit | ⬜ |
| AC-6 Duplicates | Same vendor + number → duplicate; same vendor + total within the window → duplicate; outside the window → not; duplicate lines unmatched | unit | ⬜ |
| AC-7 Explanations | Snapshot of one explanation per type; amounts in the text equal the `amount` field | unit | ⬜ |
| AC-8 Pure and fast | No I/O imports in `matching/` (lint); same input → identical output; p95 per group < 200 ms in the eval | unit + eval | ⬜ |
| AC-9 Unit test coverage | All of the above present; `pnpm test` green | unit | ⬜ |
| AC-10 Command | `pnpm eval` and `--subset full` both print the scoreboard and write a results JSON | manual | ⬜ |
| AC-11 Metrics | Scorer unit tests on hand-made predictions: perfect → 100; one missing link → recall drops by the exact amount; wrong amount → amount accuracy drops | unit | ⬜ |
| AC-12 Baseline gate | Unit: a 2.1-point drop fails, 2.0 passes, a rise passes; `--update-baseline` rewrites the file | unit | ⬜ |
| AC-13 CI | Eval job green on the M2 PR; a throwaway PR with a broken threshold shows it red (link recorded), then is closed | CI | ⬜ |
| AC-14 Targets | Link F1 ≥ 98, exception P ≥ 90, R ≥ 95 on CI subset and full set; misses listed with reasons | eval | ⬜ |
| AC-15 Docs | README eval section with a real scoreboard; glossary terms; `docs:check` passes | manual + CI | ⬜ |
| AC-16 Price noise | Rate 1.0 alone plants it in every set and expects no exception; delta always within tolerance; CI subset has ≥ 2; matcher raises nothing for them (per-type FP = 0) | unit + eval | ⬜ |

## Eval impact
This milestone **creates** the first baseline. Expected: grouping 100, high link
and exception scores, with the remaining misses in fuzzy pairs (SKU-less lines
with heavy abbreviations).

## Manual demo steps
1. `pnpm eval`, then read the scoreboard and per-type table.
2. Open the newest `evals/results/*.json` and look at any false positive or negative with its explanation.
3. `pnpm generate` (100 sets), then `pnpm eval --subset full`.

## Results summary
_Filled in during the Testing phase._
