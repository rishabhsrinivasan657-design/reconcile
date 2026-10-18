# M5: The website. Retrospective

- **Date:** 2026-10-18
- **Release:** [v0.6.0](https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.6.0) · [PR #6](https://github.com/rishabhsrinivasan657-design/reconcile/pull/6)
- **Plan vs. reality:** 13 criteria, all pass. We planned 13 commits and made 17 (plus docs).
  Lighthouse: accessibility 100 and performance 96–99 on every page.

## What went well
- **Deciding the look first paid off.** The approved mockup and style guide meant building
  was mostly filling in. No page needed a restyle afterward.
- **The API contract held.** Generating the website's types from the API's manual meant every
  API change showed up as a type error in the website, not as a broken page.
- **Real data found real bugs.** Clicking through the website with actual test sets exposed the
  misread-PO case (its purchase order lived in another set) that no unit test had covered.
- **Accessibility tools earned their keep.** axe in the browser test and Lighthouse caught faint
  hint text, a missing role, and skipped heading levels: all small, all easy to miss by eye.
- **Live updates were simple.** Hints over Redis plus "refetch what changed" needed no extra
  service, and a missed message is harmless.

## What didn't
- **Mockup boxes were hand-placed.** You noticed they looked off. The fix was to measure them from
  the page, and to measure the real AI's boxes too (B-24). A mockup should use real data where it can.
- **"Works on my machine."** A fresh clone failed straight away: `.env.example` had an empty key
  line that my own `.env` didn't. Only following the README from scratch caught it.
- **Demo setup cost time.** The worker's replay folder wasn't where the saved answers were, a
  leftover dev server from yesterday held the port, and a too-broad cleanup command stopped my
  servers and Docker. Nothing was lost, but each detour cost minutes.
- **A commit went in with a lint error** (caught and amended before pushing). The same
  command-chaining mistake as in M4, in a smaller form.

## Lessons
- Before calling a milestone done, **follow the README from a fresh clone.**
- Mockups should use real data and real measurements where possible, so "looks off" is caught early.
- Stop processes **by their exact ID**, never by matching a word in their name.
- Run the checks as separate steps whose failure stops the chain (`a && b && c`), never piped into `tail`.

## Follow-ups (backlog)
- **B-24 (P2):** add highlight-box accuracy to the scoreboard (scans: 80% of line-item boxes on target)
- **B-25 (P3):** phone performance on slow 4G (Problems: 62)
- **B-22 (P1):** AI double-check for the word matcher's mid-confidence pairs (still open)
- **B-21 (P2):** test for the worker's retry and quota-stop paths (still open)
- Undoing a decision needs its own "reversed" decision (not in the backlog yet; add if a user asks)
