# M3: LLM client and extraction. Test plan

Written in the Design phase and executed in the Testing phase.

## Coverage map

| AC | How it's verified | Type | Result |
|---|---|---|---|
| AC-1 Providers | Provider factory returns the right LangChain class per `LLM_PROVIDER`. Each provider runs one structured call against recorded/mocked HTTP. Gemini runs live during recording. | unit + live | ⬜ |
| AC-2 Limits | Fake clock: an 11th request in a minute waits at RPM 10; a daily budget hit fails with the resume message. 429 + `Retry-After: 3` → waits 3 s; 5 failures → error; every attempt logged. | unit | ⬜ |
| AC-3 Cache | Second extraction of the same file: 0 provider calls (spy). Different prompt version/model → miss. A prompt text change without a version bump fails the lock test. | unit | ⬜ |
| AC-4 Call log | `pnpm extract` with a DB writes `LlmCall` rows (incl. cache hits). Memory sink fills the results file. No key-like strings in logs or results. | integration + unit | ⬜ |
| AC-5 Read documents | Live: every CI-subset document (PDF multi-page and PNG) extracts and validates | live (recording) | ⬜ |
| AC-6 Validate | Invalid answer → one repair retry → success; twice invalid → `FAILED`. Each math check fires on a crafted bad answer. | unit | ⬜ |
| AC-7 Confidence and location | A failed check halves the involved fields' confidence. Boxes convert from 0–1000 `[ymin,xmin,ymax,xmax]` to 0–1 `[x0,y0,x1,y1]`. | unit | ⬜ |
| AC-8 Review flag | A low-confidence field or failed check → `needsReview` with reasons; a clean answer → not flagged | unit | ⬜ |
| AC-9 CLI | `pnpm extract <pdf>` and `<png>` print fields, confidence, reasons, cost; `--json` | manual | ⬜ |
| AC-10 Extract stage | Scorer tests: perfect → 100; one wrong price → precision and recall drop by one field; a "fixed" typo counts as wrong; an extra line counts as wrong; PDF/PNG split | unit | ⬜ |
| AC-11 E2E stage | Runs extract → match → score; shows match and e2e side by side | eval | ⬜ |
| AC-12 Review quality | Crafted results: 2 of 4 wrong fields flagged → catch rate 50 | unit | ⬜ |
| AC-13 Cost and speed | Totals equal the sum of the recorded calls; per-document and per-set figures present; identical across replays | unit + eval | ⬜ |
| AC-14 Replay and CI | `--replay` with an empty cache fails with the re-record message; the CI job passes with no key; per-stage baseline gate tested | unit + CI | ⬜ |
| AC-15 Targets | Field F1 (PDF ≥ 95, scan ≥ 85), e2e link ≥ 90, cost < $0.01 per set: reported per model with reasons for any miss | eval | ⬜ |
| AC-16 B-16 | At rate 1.0, ≥ 50% of SKU-less lines are reworded; the answer key still links them; match baseline re-recorded with the reason | unit + eval | ⬜ |
| AC-17 Docs | README sections; `.env.example` lists every new var; `docs:check` | manual + CI | ⬜ |

## Eval impact
- **Match** may drop below 100 (B-16 makes fuzzy cases harder). That's expected.
- **Extract and e2e** are new: their first recorded runs become the baselines.

## Manual demo steps
1. `pnpm extract evals/golden-ci/S0010/inv-1.pdf`
2. `pnpm eval --stage all --replay`
3. Compare the `match` and `e2e` columns, then the Flash-Lite vs. Flash table.

## Results summary
_Filled in during the Testing phase._
