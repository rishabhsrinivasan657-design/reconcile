# M5: The website. Test plan

Written now, checked off in the Testing phase. "Unit" means a small, fast test of one
piece. "Integration" means real database and Redis. "Browser" means the one Playwright test.

## How each criterion gets checked

| AC | How we check it | Kind | Result |
|---|---|---|---|
| AC-1 Decide | `POST /exceptions/:id/decision` with a note → status changes, a decision record and a history entry are saved together. Empty note → 400. Deciding twice → 409. A problem from an old match version → 409. On screen: the problem leaves the open list and the next one is selected. | integration + browser || ✅ API tests: decision saved with record + history entry; empty note → 400; second decision → 409 naming who decided; problem from an old match → 409. Browser test: write-off by keyboard leaves the open list and the next problem opens. |
| AC-2 Correct a field | `POST /documents/:id/corrections` → a new version marked *human* (the AI's version kept), math checks re-run, a match job queued, and the PO's problems change when the fix changes the numbers | integration || ✅ API test: version 2 marked HUMAN, AI version kept, confidence 1 for the fixed field, math warning returned, re-match queued; bad value → 400. Checked by hand: the page waits on the live feed until the PO is re-matched. |
| AC-3 Upload and watch | Uploading publishes *uploaded*, *reading*, *ready*, *matched* events; `GET /events` streams them to a connected client; the upload page shows each status without a refresh | integration + browser || ✅ API test streams a live event to a connected client; Redis announcement test. Browser test: three files reach *matched* without a refresh. |
| AC-4 Highlights | `GET /documents/:id/pages/1` returns a PNG; field boxes are drawn where the API says (unit test on the box-position math); unsure fields are marked | unit + integration || ✅ Page image endpoint test (PNG, cached, missing page → 404); box-position unit tests; unsure fields marked. Box accuracy measured on the 20 test sets: PDFs 97–100% on target, scans 80–96% (B-24). |
| AC-5 Side by side | `GET /exceptions/:id` returns the involved lines from all three documents; the comparison shows them with the difference emphasized | integration + unit || ✅ API test: involved lines from all three documents, sorted by impact, extra invoice line shown alone. Component test: the differing price and quantity are emphasized with the difference in words. |
| AC-6 History | `GET /sets/:po/history` lists upload, read, flag, match, problem, and decision entries in order, with the person's name and note for decisions | integration + browser || ✅ API test: plain sentences in order, decision with name and note; browser test finds the write-off and its note in the PO history. |
| AC-7 Overview numbers | `GET /overview` on a known database: money at risk, counts, cost and speed per document all equal hand-computed values | integration || ✅ API test: money at risk, counts by type, sets, documents, AI cost and speed equal values computed from the database. |
| AC-8 Visual identity | Every page reviewed against `docs/style-guide.md` in both themes (checklist with screenshots); no raw color values outside `tokens.css` (a lint check) | manual + lint || ✅ Every page reviewed in light and dark against the style guide (findings fixed, below). Token test: no raw colors outside `tokens.css`. |
| AC-9 Keyboard | Unit tests for the shortcut handler; the browser test makes its decision with the keyboard (`W`, typing the note, `Enter`) | unit + browser || ✅ Unit tests for the key reader (found and fixed a bug); browser test decides by keyboard and opens pages with `G` `P`. |
| AC-10 States | Each page has loading, empty, and error versions (component tests render all three) | unit || ✅ Component tests render loading, empty, and error states; every page uses them (empty Review state seen in the review). |
| AC-11 Accessibility and speed | axe finds no serious problems on any page the browser test visits; Lighthouse by hand on Overview, Problems, and Document: accessibility and performance ≥ 90 | browser + manual || ✅ axe: 0 serious problems on all pages visited, light and dark. Lighthouse (desktop, production build): accessibility 100, performance 96–99 on every page (table below). |
| AC-12 Browser test | Playwright: upload a test set → wait for *matched* → open the top problem → write off with a note → see it in the PO history. Replayed AI, runs in CI as a required check. | browser || ✅ Passes locally (about 6 s) and in CI as **Browser test (Playwright)**. |
| AC-13 Instructions | From a clean clone, follow the README to open the website; screenshots present | manual || ✅ After a fix: following the README from a fresh clone failed at first (an empty `GEMINI_API_KEY=` line stopped the worker). Fixed; the fresh clone then uploaded and matched a set. |

## Scoreboard
No change expected: M5 doesn't touch reading or matching. The eval gate must stay green.

## Demo steps
1. `docker compose up -d && pnpm dev` (API, worker, and website)
2. Open the website, drag in the three files of one test set, and watch them go to *matched*.
3. Open Problems, press `J` to the price problem, press `W`, write a note, save.
4. Open the PO and find the decision in its history. Switch to dark mode.
5. Open the invoice, hover the fields, correct one, and watch the PO re-match.

## Results

Checked 2026-10-18.

- **All 13 criteria pass.**
- **Tests:** 188 automated tests pass. That includes 13 API tests for the new addresses, 21 website tests, and the browser test. CI is green on all four checks (lint/typecheck/docs, tests, evals, browser test).
- **Scoreboard:** unchanged, within 2 points of the baseline; matching and end-to-end still 100.

### Lighthouse (desktop preset, production build)

| Page | Performance | Accessibility | Best practices | Largest paint |
|---|---|---|---|---|
| Overview | 98 | 100 | 100 | 1.1 s |
| Problems | 97 | 100 | 100 | 1.3 s |
| POs | 99 | 100 | 100 | 0.9 s |
| PO detail | 98 | 100 | 100 | 1.2 s |
| Document | 96 | 100 | 100 | 1.4 s |
| Upload | 99 | 100 | 100 | 1.0 s |
| Review | 98 | 100 | 100 | 1.1 s |

On a simulated slow phone over 4G, Problems scores 62 for performance (98 accessibility). The
site is laptop-first and AC-11 is about desktop, so this went to the backlog as B-25.

### Found and fixed in this phase

| Found by | Problem | Fix |
|---|---|---|
| Lighthouse | Section labels jumped from the page title straight to third-level headings (Overview, Problems) | Labels marked up in the right order; accessibility now 100 |
| Style-guide review | The misread PO number (HP-PO-10793) showed as its own PO "needing review", with no hint it was grouped | PO list and PO page say "Grouped into HP-PO-107093" |
| Style-guide review | On tablets and phones, you scrolled past every problem to reach the one you picked | The list stays short and scrolls on its own |
| Style-guide review | "Invoice says…" appeared when wording differed only by a period | Punctuation and case are ignored for that comparison |
| Fresh-clone check | An empty `GEMINI_API_KEY=` line (as in `.env.example`) stopped the worker, even in demo mode | An empty key line now means "not set"; test added |
| Implementation (axe) | Progress bars had no role; hint text was 4.3:1 contrast | Fixed before this phase (see design §9) |

### Checked by hand
- Tablet (820 px) and phone (390 px): no sideways scrolling.
- The demo steps above, from a running `pnpm dev:demo`.
