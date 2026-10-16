# ADR-0006: Seeded synthetic golden set, replay-mode CI, 2-point regression gate

- **Status:** Proposed
- **Date:** 2026-10-16
- **Requirements:** FR-15, FR-16, FR-17, NFR-05

## Context
We have no real documents. Quality claims need labeled data. CI can't spend
free-tier quota on every PR, and fork PRs don't receive secrets.

## Options
1. Hand-label a few real-looking PDFs. Slow, tiny, and no discrepancy labels.
2. Live LLM evals in CI on every PR. Uses quota, is flaky, and needs secrets.
3. **Generate labeled data from a seed, and replay cached LLM responses in CI.**

## Decision
Option 3.
- The generator is **byte-deterministic** from a seed (fixed PDF metadata, a
  seeded PRNG, no wall-clock). The same seed gives the same sha256, so cache keys stay stable.
- `ground_truth.json` per set holds field values and bboxes, expected line
  matches, and expected exceptions.
- The 20-set CI subset (PDFs plus truth) and its LLM cache are committed. The
  full ~100 sets are regenerated locally.
- CI runs `pnpm eval --subset ci --replay`. A cache miss fails with "prompt
  changed: run `pnpm eval:record` locally and commit the cache". This keeps CI
  key-free.
- **Gate:** any metric more than 2 percentage points below `evals/baseline.json`
  fails CI. A baseline update is its own commit, with the reason in the message.
- Metrics are reported separately for clean PDFs and scanned images.

## Consequences
- ➕ Free, repeatable, and labeled at any scale, with discrepancies known exactly.
- ➖ Synthetic documents may be easier than real ones. We mitigate with varied
  layouts and fonts, scan noise, and typos, and we say so openly in the README.
- ➖ Replay doesn't catch provider-side model drift. Run a live eval manually
  before each release.
