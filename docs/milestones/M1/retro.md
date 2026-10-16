# M1: Foundation and synthetic data. Retrospective

- **Date:** 2026-10-16
- **Release:** [v0.2.0](https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.2.0) · [PR #1](https://github.com/rishabhsrinivasan657-design/reconcile/pull/1)
- **Planned vs. actual:** all 19 acceptance criteria delivered. 18 fully pass; AC-4
  is partial (CI green, red-path demo skipped). Six documented deviations (design §10).
  The 15 planned commits became 19.

## What went well
- **The spike paid off.** A 20-line throwaway test proved deterministic PDFs and
  rasterizing worked before the real renderer was built.
- **Design caught a money bug on paper.** The double-counting between `SHORT_SHIP`
  and `QTY_BILLED_NOT_RECEIVED` was resolved before any code existed.
- **Determinism held end to end.** Regenerating the CI subset from a fresh clone
  changed zero files. That's what makes the answer key, the LLM cache, and the evals trustworthy.
- **Visual verification.** Drawing the answer-key boxes over a rotated scan proved
  the field locations right in one glance. No unit test would have been as convincing.
- **Fast.** 100 sets in ~19 s against a 120 s budget.

## What didn't
- **Fonts cost time.** fontkit couldn't subset most WOFF2 files, or IBM Plex Mono at
  all. It was found by trial, one font at a time.
- **Generated-data coverage was checked late.** The catalog was initially too small
  for the per-vendor SKU counts, and the duplicate-invoice rate was too low for CI
  coverage. Both were found only when the numbers were printed.
- **Privacy slip on merge.** Merging through GitHub used the account's Gmail as the
  merge-commit author on the public repo. The fix (rewriting `main`) needs the owner's
  approval and a GitHub setting.
- **Smaller issues:** the AC-4 red-path demo was skipped; sets are capped at 13 lines;
  local port 5432 was taken (worked around with `POSTGRES_PORT`); a shell command hung
  waiting on input.

## Lessons
- Spike **every** risky external dependency (fonts, not only the PDF library).
- Print summary statistics of generated data early. Coverage is a requirement too.
- Merge locally, with the repo's noreply identity, then push. Or enable GitHub email
  privacy so web and API merges use the noreply address too.

## Follow-ups (added to `backlog.md`)
- B-12: Enable GitHub "Keep my email addresses private", and decide whether to rewrite
  the M1 merge commit (owner action).
- B-13: Branch protection on `main` requiring both CI checks. This also proves the
  red path (closes AC-4).
- B-14: More SKUs per vendor so sets can reach 25 lines and break across pages more often.
- B-15: Benign within-tolerance noise (e.g. $0.004 rounding) so precision evals see
  near-misses that must *not* raise exceptions.
- B-11 (still open): move the local repo out of the temporary session folder. The risk
  is lower now that everything is on GitHub.
