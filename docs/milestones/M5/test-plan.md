# M5: The website. Test plan

Written now, checked off in the Testing phase. "Unit" means a small, fast test of one
piece. "Integration" means real database and Redis. "Browser" means the one Playwright test.

## How each criterion gets checked

| AC | How we check it | Kind | Result |
|---|---|---|---|
| AC-1 Decide | `POST /exceptions/:id/decision` with a note → status changes, a decision record and a history entry are saved together. Empty note → 400. Deciding twice → 409. A problem from an old match version → 409. On screen: the problem leaves the open list and the next one is selected. | integration + browser | |
| AC-2 Correct a field | `POST /documents/:id/corrections` → a new version marked *human* (the AI's version kept), math checks re-run, a match job queued, and the PO's problems change when the fix changes the numbers | integration | |
| AC-3 Upload and watch | Uploading publishes *uploaded*, *reading*, *ready*, *matched* events; `GET /events` streams them to a connected client; the upload page shows each status without a refresh | integration + browser | |
| AC-4 Highlights | `GET /documents/:id/pages/1` returns a PNG; field boxes are drawn where the API says (unit test on the box-position math); unsure fields are marked | unit + integration | |
| AC-5 Side by side | `GET /exceptions/:id` returns the involved lines from all three documents; the comparison shows them with the difference emphasized | integration + unit | |
| AC-6 History | `GET /sets/:po/history` lists upload, read, flag, match, problem, and decision entries in order, with the person's name and note for decisions | integration + browser | |
| AC-7 Overview numbers | `GET /overview` on a known database: money at risk, counts, cost and speed per document all equal hand-computed values | integration | |
| AC-8 Visual identity | Every page reviewed against `docs/style-guide.md` in both themes (checklist with screenshots); no raw color values outside `tokens.css` (a lint check) | manual + lint | |
| AC-9 Keyboard | Unit tests for the shortcut handler; the browser test makes its decision with the keyboard (`W`, typing the note, `Enter`) | unit + browser | |
| AC-10 States | Each page has loading, empty, and error versions (component tests render all three) | unit | |
| AC-11 Accessibility and speed | axe finds no serious problems on any page the browser test visits; Lighthouse by hand on Overview, Problems, and Document: accessibility and performance ≥ 90 | browser + manual | |
| AC-12 Browser test | Playwright: upload a test set → wait for *matched* → open the top problem → write off with a note → see it in the PO history. Replayed AI, runs in CI as a required check. | browser | |
| AC-13 Instructions | From a clean clone, follow the README to open the website; screenshots present | manual | |

## Scoreboard
No change expected: M5 doesn't touch reading or matching. The eval gate must stay green.

## Demo steps
1. `docker compose up -d && pnpm dev` (API, worker, and website)
2. Open the website, drag in the three files of one test set, and watch them go to *matched*.
3. Open Problems, press `J` to the price problem, press `W`, write a note, save.
4. Open the PO and find the decision in its history. Switch to dark mode.
5. Open the invoice, hover the fields, correct one, and watch the PO re-match.

## Results
(Filled in during the Testing phase.)
