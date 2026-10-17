# M4: Upload, background processing, and AI matching. Retrospective

- **Date:** 2026-10-17
- **Release:** [v0.5.0](https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.5.0) · [PR #5](https://github.com/rishabhsrinivasan657-design/reconcile/pull/5)
- **Plan vs. reality:** 16 criteria. 15 fully pass, and AC-4 is partial (the retry and quota-stop
  paths have no automated test). We planned 13 commits and made about 25.

## What went well
- **One small fix, big result.** Grouping a PO number that's one character off (same vendor,
  flagged) took accuracy on AI-read documents from 84/94 to 100/100.
- **The scoreboard proved itself.** All 20 test sets through the real API, queue, and worker
  gave *exactly* the answers the scoreboard predicted, so we can trust its numbers.
- **The AI earned its place, measured.** Hybrid pairing fixed every vendor-name miss on the
  test sets with a single AI call, and it explains each pair.
- **The pieces fit.** The shared toolbox meant the API and worker were thin. Most logic was
  tested once, in one place.

## What didn't
- **A commit went out with failing tests.** A command kept going after the tests failed. It
  was fixed in the next commit, and commits now only happen after a passing test run.
- **The first harder test cases weren't hard.** Vendor names that kept the brand still scored
  100 with the simple matcher. We only noticed by checking the result, not by planning.
- **The word matcher is overconfident.** It gives ~0.8 to pairs with the same size even when
  they're different products (Almond Butter vs Groundnut Spread). In hybrid mode those never
  reach the AI. That explains the last misses on the stress sets (98.3, not 100).
- **Some scripted edits silently didn't apply** (a text didn't match after auto-formatting).
  They were caught by typecheck or by re-reading, but it cost time.

## Lessons
- Commit only after the full test run passes, with no shortcuts.
- When you make a test harder, **check that it can fail** before trusting it.
- A matcher's confidence needs checking too, not just its answers (see B-22).

## Follow-ups (backlog)
- **B-21 (P2):** automated test for the worker's retry and quota-stop paths (closes M4 AC-4)
- **B-22 (P1):** let the AI double-check the word matcher's mid-confidence pairs (0.75–0.9)
- **B-23 (P3):** run the AI-only strategy on the stress sets when quota allows
- **B-18 (P2):** date sanity checks (still open)
