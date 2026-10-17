# M4: Upload, background processing, and AI matching. Test plan

Written now, checked off in the Testing phase. "Unit" means a small, fast test of
one piece. "Integration" means real database/Redis. "Eval" means the scoreboard.

## How each criterion gets checked

| AC | How we check it | Kind | Result |
|---|---|---|---|
| AC-1 Upload | Upload a PDF → 202 and a "read" job is queued. The same file again → same document, no new job. A `.exe` renamed to `.pdf` → rejected. 11 MB → rejected. | integration | ✅ API test: 202 and queued once; same file → 200, not queued; non-document → 415 problem JSON. Pipeline test: 11 MB → rejected. |
| AC-2 Results | Each address returns the right data for a processed PO (documents, status, problems with explanations, original file) | integration | ✅ API test on a processed PO: set status, documents, problems with explanations, document detail (confidence, AI calls), original file |
| AC-3 Formats + manual | A bad request gets problem JSON. `/docs` lists every address. Responses match their declared format. | integration | ✅ Invalid query → 400; unknown id → 404; both problem JSON. `/docs/json` lists all 8 addresses. |
| AC-4 Reading job | Saves a new version each time, sets ready / needs review, fails after 3 tries; a quota error stops at once; the same file runs only once | integration | 🟡 New version saved, ready / needs review set (pipeline + full tests). The *retry 3 times, then failed* and *quota error stops at once* paths are written (BullMQ attempts, `UnrecoverableError`) but **not covered by an automated test**. |
| AC-5 Matching job | A second upload creates match version 2. A decision on a problem in version 1 shows up in version 2. | integration | ✅ Second match → version 2; a DISPUTED decision carries over with `carriedOverFromId` |
| AC-6 Grace period | Missing receipt within 7 days → PO *waiting*, no "missing" problem, a re-check is scheduled. After the period → "missing" problem raised. | integration | ✅ Missing document within 7 days → *waiting*, no problem, re-check time set; 8 days later → MISSING_DOCUMENT raised |
| AC-7 Shared speed limit | Two limiters sharing Redis together allow only the configured number per minute | integration | ✅ Two Redis limiters together: the 5th request in a minute at 4/min waits 15 s |
| AC-8 History | Every step writes a history entry; a failed save writes neither | integration | ✅ Upload, read, flag, match, and problem events written (counts checked in tests); each is in the same transaction as its change (by design, not separately fault-injected) |
| AC-9 AI matcher | Pairs come with confidence and a reason; a size mismatch is refused; replay works with no key | unit + eval | ✅ Pairs carry confidence + reason; different sizes/units refused; hybrid sends only hard lines to the AI; prompt locked; replay works with no key |
| AC-10 Chosen by data | `--fuzzy text|llm|hybrid` table with scores, cost, speed; the winner becomes the default | eval | ✅ CI subset exception precision: text 89.5, llm 100 (3 calls), **hybrid 100 (1 call)**; 200 stress sets: text 96.8, hybrid 98.3 (2 calls). Hybrid is the default. |
| AC-11 Full test | Upload one set → matched → API problems equal the answer key (replay, no key) | integration | ✅ API upload → queue → worker → API; problems equal the answer key (real Postgres + Redis, replayed AI) |
| AC-12 Pipeline = eval | All 20 test sets through the real API + worker give the same problems as the e2e scoreboard | integration + eval | ✅ All 20 CI sets through the real API + worker give exactly the e2e eval's problems |
| AC-13 Instructions | Follow the README from a clean clone: `pnpm dev`, a curl upload, `/docs` opens | manual | ✅ Ran `pnpm dev` (replay mode), uploaded S0010 with curl → matched in seconds with 2 explained problems; `/docs` loads; `/health` all green |
| AC-14 Misread PO numbers | `HP-PO-10793` (RR) + `HP-PO-107093` (PO, same vendor) → grouped, with a note and *needs review*; different vendors → not grouped | unit + eval | ✅ Unit tests (merge with a note; not across vendors; not 2 characters apart). e2e on AI-read documents: exception P/R 84.2/94.1 → **100/100**. |
| AC-15 Vendor names | Generator: vendor-name lines have no SKU and an alias; the answer key still pairs them; at least 2 in the test sets | unit | ✅ Generator tests (no SKU, no brand, size kept, still paired, no exception); the CI subset includes vendor-name lines; they defeat the text matcher (89.5) |
| AC-16 Provisional | A PO with a flagged document → matched and labeled provisional in the API | integration | ✅ A set with a flagged document is matched, labeled NEEDS_REVIEW + provisional, and keeps its problems |

## Expected scoreboard changes
- **e2e** should improve (the misread PO number gets grouped).
- **match** with `text` will likely drop below 100 on vendor-name lines. That's the point of the harder test.

## Demo steps
1. `docker compose up -d && pnpm dev`
2. Upload the three files of one test set with `curl`, then open `/sets/<PO>` in the browser.
3. Open `/docs` and try an address.

## Results

Checked 2026-10-17.

- **15 of 16 criteria fully pass. AC-4 is partial:** the retry and quota-stop paths aren't covered by an automated test.
- **Tests:** 22 files, 154 tests, all green (including the full pipeline on Postgres + Redis).
- **Scoreboard:** extract field F1 99.8; match and e2e **100** with hybrid pairing; the real pipeline equals the eval.
- **Found and fixed while building:**
  - an AI answer that stopped early (now its complete part is kept)
  - vendor names that were too easy (the brand was dropped)
  - scorer tests that assumed the word matcher was perfect. This one briefly went out failing; it was fixed right after, and the lesson is in the retro.
