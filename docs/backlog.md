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
| ~~B-16~~ | Harder fuzzy cases: let `sku_omitted` lines also get a reworded/abbreviated description, so the text matcher (and the M4 LLM) face real ambiguity. M2 scores 100 partly because these never combine. | P1 | M2 implementation (→ done in M3, AC-16) |
| ~~B-17~~ | ~~Tolerant grouping for a PO number one character off~~ ✅ done in M4 (AC-14) | P1 | M3 testing |
| B-18 | Date sanity checks: invoice/receipt dates vs the PO date (order, plausible year), day/month swap detection; two confident date misreads went unflagged in M3 | P2 | M3 testing |
| B-19 | Re-record before each release (provider-side model drift isn't visible to replay CI) | P2 | M3 design risk |
| B-20 | Finish the `gemini-3.8-flash` comparison on the CI subset: its free daily quota ran out after 15/60 documents (resumes from cache). On those 15: 100% precision but ~81 s/doc vs 7.5 s for Flash-Lite | P2 | M3 testing |
| B-21 | Automated test for the worker's retry and quota-stop paths (closes M4 AC-4) | P2 | M4 testing |
| B-22 | Let the AI double-check the word matcher's mid-confidence pairs (0.75–0.9): it gives ~0.8 to same-size different products, which hybrid then never sends to the AI | P1 | M4 testing |
| B-23 | Run the AI-only pairing strategy on the stress sets when quota allows | P3 | M4 testing |
| B-24 | Add box accuracy to the scoreboard (how well the AI's highlight boxes overlap the answer key's). Measured once in M5: PDFs 97–100% of boxes on target, scans 96% for header fields but 80% for line items | P2 | M5 design feedback |
| B-25 | Phone performance: on a simulated slow phone over 4G, the Problems page scores 62 (desktop 97). Split the page code so the first screen loads less JavaScript | P3 | M5 testing |
| B-26 | `GET /exceptions?includeInformational=false` is read as true (a loose text-to-true conversion). Parse "false" properly and add a test | P2 | M6 implementation |

## Tech debt

_None yet._

## Decided against

_None yet. Record rejected ideas here with a one-line reason so they aren't relitigated._
