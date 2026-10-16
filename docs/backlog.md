# Backlog

Prioritized ideas, deferred scope, and tech debt. Anything found mid-milestone
that isn't in the current requirements goes **here**, not into the PR.

Priority: **P1** next after the current plan · **P2** valuable later · **P3** nice to have.

## Deferred features

| ID | Item | Priority | Source |
|---|---|---|---|
| B-01 | Retailer deductions: a deduction/remittance document type, `DEDUCTION` exception, matching against shipments | P1 | PRD A1 |
| B-02 | Partial receipts: multiple receiving reports per PO | P2 | PRD A6 |
| B-03 | UOM conversion (case ↔ each) | P2 | PRD A5 |
| B-04 | Per-vendor tolerance overrides in the UI | P2 | CLAUDE.md |
| B-05 | Multi-user auth and roles (clerk, manager, auditor) | P2 | PRD non-goals |
| B-06 | Shopify / Stripe / accounting integrations | P3 | PRD non-goals |
| B-07 | Exception trend dashboard for managers | P2 | PRD §2 |
| B-08 | Confidence calibration chart in eval output | P2 | PRD §11 |
| ~~B-09~~ | ~~Create the GitHub repo; push `main` and tags before M1's first PR~~ ✅ done 2026-10-16 | P1 | M0 retro |
| B-10 | CI docs check: relative links and Mermaid syntax | P1 | M0 retro |
| B-11 | Move the repo out of the temporary session folder | P1 | M0 retro (mitigated: everything is on GitHub) |
| B-12 | Enable GitHub "Keep my email addresses private"; decide on rewriting the M1 merge commit | P1 | M1 retro |
| B-13 | Branch protection on `main` requiring CI (proves the red path; closes M1 AC-4) | P1 | M1 retro |
| B-14 | More SKUs per vendor so sets reach 25 lines and more multi-page documents | P2 | M1 retro |
| B-15 | Benign within-tolerance noise for precision evals | P2 | M1 retro |

## Tech debt

_None yet._

## Decided against

_None yet. Record rejected ideas here with a one-line reason so they aren't relitigated._
