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
| ~~B-11~~ | ~~Move the repo out of the temporary session folder~~ ✅ done 2026-10-17: now at `~/Desktop/Projects/Reconcile` | P1 | M0 retro |
| ~~B-12~~ | ~~Enable GitHub email privacy; decide on rewriting the M1 merge commit~~ ✅ decided 2026-10-17: owner is fine with the email showing; `main` is left as is | P1 | M1 retro |
| ~~B-13~~ | ~~Branch protection on `main` requiring CI~~ ✅ enabled 2026-10-17 (M2 Q2) | P1 | M1 retro |
| B-14 | More SKUs per vendor so sets reach 25 lines and more multi-page documents | P2 | M1 retro |
| ~~B-15~~ | ~~Benign within-tolerance noise for precision evals~~ ✅ M2 (`price_noise`) | P2 | M1 retro |
| B-16 | Harder fuzzy cases: let `sku_omitted` lines also get a reworded/abbreviated description, so the text matcher (and the M4 LLM) face real ambiguity. M2 scores 100 partly because these never combine. | P1 | M2 implementation (→ in M3 scope, AC-16) |

## Tech debt

_None yet._

## Decided against

_None yet. Record rejected ideas here with a one-line reason so they aren't relitigated._
