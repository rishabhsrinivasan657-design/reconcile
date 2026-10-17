# M3: LLM client and extraction. Test plan

Written in the Design phase and executed in the Testing phase.

## Coverage map

| AC | How it's verified | Type | Result |
|---|---|---|---|
| AC-1 Providers | Provider factory returns the right LangChain class per `LLM_PROVIDER`. Each provider runs one structured call against recorded/mocked HTTP. OpenAI runs live during recording. | unit + live | ✅ All 5 providers (Gemini, Groq, OpenAI, Anthropic, Ollama) pass against a local mock API. Live calls: **Gemini works** (default); OpenAI reached but "no credits"; Groq reached but its free vision model caps output at 1K tokens/min (requirements Q5–Q7). |
| AC-2 Limits | Fake clock: an 11th request in a minute waits at RPM 10; a daily budget hit fails with the resume message. 429 + `Retry-After: 3` → waits 3 s; 5 failures → error; every attempt logged. | unit | ✅ Fake-clock tests: RPM wait, daily budget persists across restarts, TPM wait corrected by actual usage, TPD refusal, `Retry-After` honored, 5 attempts max, no retry on 400 or on no-credit/quota 429s |
| AC-3 Cache | Second extraction of the same file: 0 provider calls (spy). Different prompt version/model → miss. A prompt text change without a version bump fails the lock test. | unit | ✅ A second identical request makes 0 provider calls; a different prompt version, model, or effort setting misses. Prompt lock tests for `extract.v2` and `extract.retry.v1`. |
| AC-4b Budget guard | Ledger at $3.99 + a $0.02 call → refused before sending; cached calls still served | unit | ✅ Refused before sending at the cap; unknown-price models refused; free tiers (Groq, Ollama) exempt. Total list-price spend tracked: $1.18 (actual cost $0 on Gemini's free tier). |
| AC-4 Call log | `pnpm extract` with a DB writes `LlmCall` rows (incl. cache hits). Memory sink fills the results file. No key-like strings in logs or results. | integration + unit | ✅ `LlmCall` rows written for Gemini (12, incl. 4 cache hits), OpenAI (6 failed), Groq (1 failed); failure rows now survive the CLI's DB disconnect. The results JSON refuses key-like strings. |
| AC-5 Read documents | Live: every CI-subset document (PDF multi-page and PNG) extracts and validates | live (recording) | ✅ All 60 CI-subset documents (PDF and PNG, 1–2 pages) extract with 0 failures |
| AC-6 Validate | Invalid answer → one repair retry → success; twice invalid → `FAILED`. Each math check fires on a crafted bad answer. | unit | ✅ Repair-once tests; each math check fires on crafted answers. Live findings fixed: lenient format parsing, PO-number fallback, printed dates, JSON wrapped in text. |
| AC-7 Confidence and location | A failed check halves the involved fields' confidence. Boxes convert from 0–1000 `[ymin,xmin,ymax,xmax]` to 0–1 `[x0,y0,x1,y1]`. | unit | ✅ Failed checks halve confidence (tests); box conversion tested; **location hit rate 93.2%** live |
| AC-8 Review flag | A low-confidence field or failed check → `needsReview` with reasons; a clean answer → not flagged | unit | ✅ Tests for low confidence, failed checks, and missing fields. Live review rate 5.0%. |
| AC-9 CLI | `pnpm extract <pdf>` and `<png>` print fields, confidence, reasons, cost; `--json` | manual | ✅ `pnpm extract` on a PDF (S0010/inv-1) and a scan (S0006/inv-1.png); prints fields, confidence, reasons, tokens, cost, latency, key source; `--json` |
| AC-10 Extract stage | Scorer tests: perfect → 100; one wrong price → precision and recall drop by one field; a "fixed" typo counts as wrong; an extra line counts as wrong; PDF/PNG split | unit | ✅ Scorer tests (perfect = 100, wrong price = 1 FP + 1 FN, a fixed typo counts as wrong, an extra line hurts precision only, a failed doc counts as missed). Live: **F1 99.9** (PDF 100.0, scan 99.7), doc type 100. |
| AC-11 E2E stage | Runs extract → match → score; shows match and e2e side by side | eval | ✅ Read → match → score with a side-by-side gap table. Live: link F1 97.4, exception P/R 84.2/94.1. |
| AC-12 Review quality | Crafted results: 2 of 4 wrong fields flagged → catch rate 50 | unit | ✅ Catch-rate test (2 errors, 1 flagged → 50). Live: catch rate 0% on the **3 remaining errors** (a misread PO number and 2 dates, all at high confidence). Honest limit: the math checks can't see these (B-17, B-18). |
| AC-13 Cost and speed | Totals equal the sum of the recorded calls; per-document and per-set figures present; identical across replays | unit + eval | ✅ $0.0088/doc and $0.0265/set at list price ($0 free tier); p50 7.5 s, p95 20.9 s; identical on replay |
| AC-14 Replay and CI | `--replay` with an empty cache fails with the re-record message; the CI job passes with no key; per-stage baseline gate tested | unit + CI | ✅ A replay miss explains how to re-record; the gate passes in replay; the CI eval job runs all stages with no key (see PR #4 checks) |
| AC-15 Targets | Field F1 (PDF ≥ 95, scan ≥ 85), e2e link ≥ 90, cost < $0.01 per set: reported per model with reasons for any miss | eval | 🟡 Field F1 PDF 100 (≥95 ✅), scan 99.7 (≥85 ✅), e2e link F1 97.4 (≥90 ✅). Cost per set **$0.027 at list price (target < $0.01 ✗)**, though $0 actual on the free tier. Exception P/R 84.2/94.1 is below the PRD's 90/95 (one misread PO number). gemini-3.8-flash comparison incomplete: free quota ran out at 15/60 (B-20). |
| AC-16 B-16 | At rate 1.0, ≥ 50% of SKU-less lines are reworded; the answer key still links them; match baseline re-recorded with the reason | unit + eval | ✅ Reworded SKU-less lines (60%) plus whole SKU-less invoices (30%); match stays 100 on the CI subset and on 4×200 stress sets (246 description-only pairs) |
| AC-17 Docs | README sections; `.env.example` lists every new var; `docs:check` | manual + CI | ✅ README (extraction, providers, eval stages with real numbers), `.env.example` lists every LLM var, CLAUDE.md commands, `docs:check` |

## Eval impact
- **Match** may drop below 100 (B-16 makes fuzzy cases harder). That's expected.
- **Extract and e2e** are new: their first recorded runs become the baselines.

## Manual demo steps
1. `pnpm extract evals/golden-ci/S0010/inv-1.pdf`
2. `pnpm eval --stage all --replay`
3. Compare the `match` and `e2e` columns, then the gpt-6-luna vs. gpt-5-mini table.

## Results summary

Executed 2026-10-17.

- **16 of 18 criteria fully pass; AC-15 is partial** (cost at list price, exception P/R, Flash comparison).
- `pnpm test`: **17 files, 131 tests** green. The eval gate passes in replay.
- **The eval drove the work.** The first live run scored field F1 **55.8**. Four fixes, each found by the
  scoreboard, took it to **99.9**: lenient parsing (29 docs), PO-number fallback (6), printed dates and output
  room (2), and a self-check retry for skipped lines (2 dense ERP invoices).
- **Provider path:** OpenAI (no credit), then Groq (1K output tokens/min on its free vision model), then
  **Gemini free tier**. Each switch is recorded (requirements Q5–Q7, design §9).
- **Open issues → backlog:** B-17 tolerant PO grouping, B-18 date sanity checks, B-19 re-record before
  releases, B-20 finish the Flash comparison.
