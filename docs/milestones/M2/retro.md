# M2: Matching engine and eval harness. Retrospective

- **Date:** 2026-10-17
- **Release:** [v0.3.0](https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.3.0) · [PR #2](https://github.com/rishabhsrinivasan657-design/reconcile/pull/2) · red-path demo [PR #3](https://github.com/rishabhsrinivasan657-design/reconcile/pull/3)
- **Planned vs. actual:** 16/16 acceptance criteria. 12 planned commits became 15
  (one bug fix found by the eval, one test-results commit, one red-path record).

## What went well
- **The eval paid for itself on its first run.** It found the unlinked lines in
  incomplete sets (link recall 95.5), fixed in one commit.
- **Independence held.** The matcher was written from the PRD, a lint rule bans
  importing the generator, and it still agreed with the answer keys on 620 sets.
- **The gate was proven, not assumed.** Throwaway PR #3 turned CI red, which also
  closed M1's leftover AC-4.
- **Merging locally kept the noreply identity** (lesson from the M1 retro, applied).
- Speed: p95 0.13 ms per set against a 200 ms budget.

## What didn't
- **100 everywhere is partly a test-data blind spot.** Lines with a missing SKU are
  never also reworded, so description matching only sees easy cases (B-16).
- **Adding `price_noise` broke CI-subset coverage** of a rare type (duplicates). Fixed by
  drawing from a 200-set pool. Coverage depends on the error mix, so it has to be re-checked
  whenever planted types change.
- **The first branch-protection update failed** on a typed-parameter detail of the
  GitHub API (`-f` vs `-F`). Small, but it's a reminder to verify config changes.

## Lessons
- When a score is perfect, ask what the test *can't* see. Write it down.
- Any change to the generator's error mix needs a coverage check of the CI subset.
- Prove every alarm once with a deliberate failure.

## Follow-ups (backlog)
- **B-16 (P1):** harder fuzzy cases (missing SKU plus a reworded description). Recommended
  for M3 or before M4, so the AI-vs-baseline comparison means something.
- B-14 (P2): more SKUs per vendor, for longer and multi-page documents.
