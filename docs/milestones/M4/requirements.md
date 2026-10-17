# M4: API, worker, and AI fuzzy matching. Requirements

- **Status:** Draft, awaiting approval at the M4 Requirements gate
- **PRD links:** US-03, US-06 · FR-01, FR-02, FR-05, FR-06, FR-08, FR-12 (system events), FR-13 · NFR-03, NFR-09, NFR-10
- **Target release:** v0.5.0

## Goal

Reconcile becomes a **running backend**. You upload a PDF or scan, and a
background worker reads it with the AI, files it under its PO, matches the set
once it's complete, and saves the line matches and exceptions to the database.
A REST API (with OpenAPI docs) serves all of it. That gives the UI (M5) and the
MCP server (M6) one source of truth.

An **AI fuzzy matcher** joins the text matcher, and the scoreboard measures
whether it actually helps.

## User stories in scope

| ID | Story |
|---|---|
| US-03 | As an AP clerk, I want to upload a PO, receiving report, or invoice as PDF or image, so that it gets read without manual data entry. |
| US-06 | As an AP clerk, I want documents grouped by PO and lines matched automatically, so that I only look at what doesn't match. |

## Acceptance criteria

### A. Upload API (`apps/api`, Fastify)

- [ ] **AC-1 Upload.** `POST /documents` accepts PDF, PNG, or JPEG up to 10 MB,
  stores the file, creates a `Document` (status `UPLOADED`), writes an
  `AuditEvent`, and queues it for extraction. Re-uploading the same file (same
  sha256) returns the existing document and queues nothing (FR-01).
- [ ] **AC-2 Read endpoints.** List and detail for documents (with extracted
  fields, confidence, review reasons, status), the original file, PO sets (status:
  waiting / matched / needs review), and exceptions (filter by status and type),
  each with its explanation and the lines involved.
- [ ] **AC-3 Contract.** Every request and response is Zod-validated, errors use
  RFC 7807 problem JSON, and OpenAPI docs are generated from the same schemas and
  served at `/docs` (FR-13).

### B. Worker (`apps/worker`, BullMQ)

- [ ] **AC-4 Extract job.** Runs M3 extraction and saves a versioned `Extraction`.
  It sets the document's type, number, vendor, and PO set, then the status to
  `READY` or `NEEDS_REVIEW` (or `FAILED` after retries). It's idempotent per file
  hash and prompt version.
- [ ] **AC-5 Match job.** When a set gains a document, its PO's set is re-matched.
  The result is a new `MatchRun` version with `LineMatch` and `Exception` rows,
  and a decision already made on an exception carries over to the same exception
  in later runs (by fingerprint).
- [ ] **AC-6 Missing-document grace period.** `MISSING_DOCUMENT` is raised only
  after a configurable grace period (default 7 days) with no new document. Until
  then the set shows as *waiting*. A delayed job re-checks when the period ends.
- [ ] **AC-7 Shared rate limit.** All worker processes share one LLM rate limiter
  in Redis, so adding workers can't exceed the provider's free-tier limits
  (ADR-0002).
- [ ] **AC-8 Audit trail.** Every system state change (uploaded, extracted,
  flagged, matched, exception raised) writes an `AuditEvent` in the same database
  transaction (FR-12).

### C. AI fuzzy matcher

- [ ] **AC-9 LLM fuzzy matcher.** Behind the existing `FuzzyMatcher` interface:
  for lines left over after SKU matching, the LLM proposes pairs with a confidence
  and a **reason** (FR-08, NFR-10). Cached, rate-limited, logged, and replayable
  like extraction.
- [ ] **AC-10 Measured, not assumed.** `pnpm eval --fuzzy text|llm` compares the two
  matchers on the same sets, side by side. The default is whichever scores better,
  with cost and latency shown.

### D. End to end

- [ ] **AC-11 Pipeline test.** An automated test uploads a document set through the
  API, lets the worker process it (in replay mode, with no key), and checks the
  exceptions served by the API against the answer key.
- [ ] **AC-12 Pipeline = eval.** Running the CI subset through the real API and
  worker gives the same exceptions as the `e2e` eval stage. That proves the
  scoreboard measures the real system.
- [ ] **AC-13 Docs.** The README covers running the stack (`pnpm dev`), uploading
  with `curl`, and the API docs page.

## Out of scope

- The web UI, human actions (approve / dispute / write-off), and editing fields that
  need review (M5). M4 serves them read-only.
- The MCP server (M6). Authentication beyond the single seeded user.

## Assumptions

- Files are stored on local disk under `storage/`, behind a `Storage` interface
  (S3 later). There's one seeded user and no login yet.
- Matching is triggered per PO set. Cross-set duplicate invoices are still detected
  (M2 logic) because the match job looks at the vendor's other invoices.

## Open questions (need your answer at this gate)

- **Q1. Include B-17 (tolerant PO grouping)?** When an RR or invoice's PO number
  is one character away from a PO of the same vendor, group them and flag it for
  review. This fixes M3's biggest end-to-end error. *Recommended: yes* (small, high value).
- **Q2. Harder fuzzy test data for the AI matcher?** Today the text matcher already
  scores 100, so the AI can't show any value. Add a planted type where the
  invoice uses the **vendor's own product name**, sharing few words with ours
  ("Sunpeak Nut Spread, Crunchy Almond" vs "Sunpeak Crunchy Almond Butter").
  *Recommended: yes.* Otherwise the AI-vs-text comparison is meaningless.
- **Q3. Documents flagged for review: match now or wait?** The strict reading of
  FR-05 is to hold them back until a human reviews them (the review screen
  arrives in M5). *Recommended: match them now but mark the set "provisional,
  needs review".* Clerks see everything early, and nothing is hidden.
- **Q4. B-18 (date sanity checks): now or later?** *Recommended: later (M5).* It
  keeps M4 focused on the backend.
