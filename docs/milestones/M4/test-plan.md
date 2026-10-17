# M4: Upload, background processing, and AI matching. Test plan

Written now, checked off in the Testing phase. "Unit" means a small, fast test of
one piece. "Integration" means real database/Redis. "Eval" means the scoreboard.

## How each criterion gets checked

| AC | How we check it | Kind | Result |
|---|---|---|---|
| AC-1 Upload | Upload a PDF → 202 and a "read" job is queued. The same file again → same document, no new job. A `.exe` renamed to `.pdf` → rejected. 11 MB → rejected. | integration | ⬜ |
| AC-2 Results | Each address returns the right data for a processed PO (documents, status, problems with explanations, original file) | integration | ⬜ |
| AC-3 Formats + manual | A bad request gets problem JSON. `/docs` lists every address. Responses match their declared format. | integration | ⬜ |
| AC-4 Reading job | Saves a new version each time, sets ready / needs review, fails after 3 tries; a quota error stops at once; the same file runs only once | integration | ⬜ |
| AC-5 Matching job | A second upload creates match version 2. A decision on a problem in version 1 shows up in version 2. | integration | ⬜ |
| AC-6 Grace period | Missing receipt within 7 days → PO *waiting*, no "missing" problem, a re-check is scheduled. After the period → "missing" problem raised. | integration | ⬜ |
| AC-7 Shared speed limit | Two limiters sharing Redis together allow only the configured number per minute | integration | ⬜ |
| AC-8 History | Every step writes a history entry; a failed save writes neither | integration | ⬜ |
| AC-9 AI matcher | Pairs come with confidence and a reason; a size mismatch is refused; replay works with no key | unit + eval | ⬜ |
| AC-10 Chosen by data | `--fuzzy text|llm|hybrid` table with scores, cost, speed; the winner becomes the default | eval | ⬜ |
| AC-11 Full test | Upload one set → matched → API problems equal the answer key (replay, no key) | integration | ⬜ |
| AC-12 Pipeline = eval | All 20 test sets through the real API + worker give the same problems as the e2e scoreboard | integration + eval | ⬜ |
| AC-13 Instructions | Follow the README from a clean clone: `pnpm dev`, a curl upload, `/docs` opens | manual | ⬜ |
| AC-14 Misread PO numbers | `HP-PO-10793` (RR) + `HP-PO-107093` (PO, same vendor) → grouped, with a note and *needs review*; different vendors → not grouped | unit + eval | ⬜ |
| AC-15 Vendor names | Generator: vendor-name lines have no SKU and an alias; the answer key still pairs them; at least 2 in the test sets | unit | ⬜ |
| AC-16 Provisional | A PO with a flagged document → matched and labeled provisional in the API | integration | ⬜ |

## Expected scoreboard changes
- **e2e** should improve (the misread PO number gets grouped).
- **match** with `text` will likely drop below 100 on vendor-name lines. That's the point of the harder test.

## Demo steps
1. `docker compose up -d && pnpm dev`
2. Upload the three files of one test set with `curl`, then open `/sets/<PO>` in the browser.
3. Open `/docs` and try an address.

## Results
_Filled in during the Testing phase._
