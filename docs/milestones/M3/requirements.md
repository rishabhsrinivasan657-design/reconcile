# M3: LLM client and extraction. Requirements

- **Status:** Approved (2026-10-17)
- **PRD links:** US-02, US-05, US-10 · FR-02–FR-05, FR-16, FR-18 · NFR-01, NFR-03, NFR-04, NFR-05
- **Includes:** backlog B-16 (harder fuzzy test data)
- **Target release:** v0.4.0

## Goal

Reconcile **reads the documents itself**. An LLM (Gemini free tier by
default, swappable by a setting) turns each PDF or scan into the
`ExtractedDocument` shape the matcher already uses. Every field gets a
confidence score and its location on the page. Math checks catch reading
errors, and anything doubtful is flagged for human review.

The scoreboard then answers two new questions: **how accurately does the AI
read?** and **how much does matching suffer when it works from what the AI read
instead of perfect data?** All of this stays at $0: cached responses mean
re-running evals spends no quota, and CI replays saved responses with no API key.

## User stories in scope

| ID | Story |
|---|---|
| US-05 | As an AP clerk, I want to review only the fields the system is unsure about, so that I don't re-check everything. |
| US-10 | As a manager, I want to see LLM cost and latency per document, so that I know what automation would cost at list price. |
| US-02 | As a developer, I want one command that evaluates extraction and end-to-end matching, so that I know if a change made things better or worse. |

## Acceptance criteria

### A. LLM client (ADR-0002)

- [ ] **AC-1 One interface, four providers.** `generateStructured()` works the same
  for Gemini, Ollama, Anthropic, and OpenAI, chosen by `LLM_PROVIDER`. Provider
  switching uses **LangChain.js** chat models underneath our own cache, limiter, and
  log (decision Q4, ADR-0010). Model IDs
  come from env. Gemini is implemented and tested live. The other three are
  implemented and tested against recorded or mocked HTTP responses, since they
  have no free quota.
- [ ] **AC-2 Rate limits.** A token-bucket limiter (requests per minute and per
  day, from env) sits in front of every live call. 429/5xx responses are retried
  with exponential backoff and jitter, honoring `Retry-After`, up to 5 attempts.
- [ ] **AC-3 Response cache.** Responses are cached by hash of the document bytes
  plus prompt version, provider, and model. A second extraction of the same
  document makes **zero** API calls. A changed prompt can't silently reuse old
  answers: a test fails if a prompt's text changes without a version bump.
- [ ] **AC-4 Call log.** Every call is logged as an `LlmCall` row: provider,
  model, prompt version, purpose, latency, input/output tokens, cache hit,
  estimated cost at list price, and error. Without a database (CI), the log goes
  to the eval results file.

### B. Extraction

- [ ] **AC-5 Read any document.** PDFs (all pages) and PNG/JPEG scans are sent to
  the LLM with a versioned prompt. The answer must match a strict schema: document
  type, vendor, numbers, dates, every line item, and totals.
- [ ] **AC-6 Validate.** The answer is parsed with Zod (one automatic repair retry
  on invalid output), then checked: qty × unit price = line total, lines sum to
  the subtotal, subtotal + tax + shipping = total, and dates are real dates.
- [ ] **AC-7 Confidence and location.** Every field carries a confidence (0–1)
  and its page (plus a bounding box when the model gives one). A failed math check
  lowers the confidence of the fields involved, since the model's own confidence
  alone isn't trusted.
- [ ] **AC-8 Review flag.** A document is marked `needsReview`, listing the fields
  why, when any field is below a configurable confidence threshold or a check fails.
- [ ] **AC-9 CLI.** `pnpm extract <file>` prints the validated result with
  confidences, review reasons, cost, and latency.

### C. Evals

- [ ] **AC-10 Extraction stage.** `pnpm eval --stage extract` reports field-level
  precision / recall / F1, overall and per field, **separately for clean PDFs and
  scans**, plus document-type accuracy.
- [ ] **AC-11 End-to-end stage.** `pnpm eval --stage e2e` runs extraction, then
  matching, and scores links and exceptions against the answer keys, side by side
  with the perfect-input `match` stage.
- [ ] **AC-12 Review quality.** The eval reports the review rate (share of documents
  flagged) and the **catch rate**: of the fields the AI got wrong, how many were flagged.
- [ ] **AC-13 Cost and speed.** The eval reports tokens, estimated cost at list price,
  and p50/p95 latency **per document and per set**.
- [ ] **AC-14 Replay mode and CI.** `pnpm eval:record` runs live and saves responses
  for the CI subset to `evals/cache/`, which is committed. `--replay` uses only
  that cache and fails clearly on a miss ("prompt changed: re-record"). CI runs the
  extract and e2e stages in replay mode with **no API key**, gated by the same
  2-point baseline rule, now kept per stage.
- [ ] **AC-15 Targets (reported honestly).** PRD targets: field F1 ≥ 0.95 on clean
  PDFs, ≥ 0.85 on scans; e2e line-match ≥ 0.90; estimated cost < $0.01 per set.
  Misses are explained, not tuned away.

### D. Harder fuzzy test data (B-16)

- [ ] **AC-16** In the generator, a line with its SKU omitted can now also carry a
  reworded description: abbreviations, typos, or the vendor's own word order. The
  generator goes to 0.4.0, the CI subset is regenerated, and the `match` baseline
  is re-recorded with the reason stated. A score drop is expected and is fine.

### E. Docs

- [ ] **AC-17** The README covers setup of the API key, `pnpm extract`, and the
  three eval stages with real numbers. Every new env var is in `.env.example`.

## Out of scope

- The worker, queue, upload API, and database persistence of extractions (M4).
  M3 runs from the CLI and evals.
- The LLM fuzzy matcher (M4). The review UI (M5).
- A shared Redis rate limiter across processes. M3 uses an in-process limiter;
  Redis arrives with the worker in M4.

## Assumptions

- Documents are synthetic, so sending them to a hosted free-tier LLM raises no
  privacy issue (free-tier inputs may be used by the provider to improve models).
- Free-tier limits are low and change over time. Recording the CI subset (about 60
  documents) fits in a day's quota. A full 100-set run may take more than one day,
  and the cache makes that fine.
- Extraction is scored against what's **printed** on the page. If the AI "fixes" a
  printed typo, that counts as a reading error.

## Decisions (2026-10-17)

| # | Question | Decision |
|---|---|---|
| Q1 | Gemini API key | **Yes:** the owner creates a free Gemini key during implementation and puts it in their own `.env`. (A key pasted in chat was an OpenAI key and is being revoked. Keys are never pasted into chat or committed.) |
| Q2 | Local model (Ollama) | **Later, as a fallback.** The adapter is built and tested with mocks now. |
| Q3 | Score bounding boxes | **Yes:** reported, not gated |
| Q4 | Framework for provider switching | **LangChain.js** (owner's choice over the Vercel AI SDK and the hand-written client). Our cache, rate limiter, call log, and replay stay ours. LangGraph isn't used, since there's no multi-step agent yet. Recorded in ADR-0010, superseding the "own adapters" part of ADR-0002. |
