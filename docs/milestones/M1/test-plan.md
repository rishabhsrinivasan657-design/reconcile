# M1: Foundation and synthetic data. Test plan

Written in the Design phase and executed in the Testing phase.

## Coverage map

| AC | How it's verified | Type | Result |
|---|---|---|---|
| AC-1 Clean setup | Fresh clone into a temp dir; run the README steps exactly as written | manual + CI (`test` job does migrate on an empty DB) | ✅ Fresh `git clone` on macOS: install (5 s), migrate, seed, lint, typecheck, 53 tests, docs check all pass. Empty-DB migrate verified by CI on Linux. |
| AC-2 Workspace | `pnpm -r list --depth -1` shows exactly core, db, generator, evals | manual | ✅ core, db, generator, evals only |
| AC-3 Quality commands | `pnpm lint && pnpm typecheck && pnpm test` green. A fixture file importing `@prisma/client` from core makes lint fail. | CI + unit | ✅ All green locally and in CI. `purity.test.ts` proves the core import ban and the generator's wall-clock and `Math.random` bans. |
| AC-4 CI | The PR shows the `check` and `test` jobs green. A deliberately broken commit shows red, then is reverted. | CI | 🟡 Both jobs green on PR #1 (check 28 s, test 49 s). The planned "deliberately broken commit shows red" demo was **not done**, to keep PR history clean. |
| AC-5 Env | Unit: a missing or invalid `DATABASE_URL` throws a readable error | unit | ✅ `env.test.ts` (3 tests) |
| AC-6 Schema | `prisma migrate deploy` on an empty DB succeeds. A unit test asserts money columns are `Decimal`. | integration | ✅ `schema.test.ts`: 12 tables, money `numeric(14,4)`. CI migrates an empty DB. |
| AC-7 Append-only | Integration: INSERT works; UPDATE and DELETE throw `append-only` | integration | ✅ `audit-event.test.ts`: INSERT ok; UPDATE, DELETE, and raw-SQL UPDATE rejected |
| AC-8 Seed | Run the seed twice; counts are unchanged (1 user, 15 vendors, ~200 items) | integration | ✅ `seed.test.ts`: 1/15/200, unchanged on a second run |
| AC-9 Command | Generate 10 sets; each folder has the expected files per its answer key | unit | ✅ `generate.test.ts`: files match the answer key; only the planted missing doc is absent |
| AC-10 Catalog | 15 vendors, 190–210 SKUs, unique `(vendor, sku)`, prices > 0; same seed gives equal JSON | unit | ✅ `catalog.test.ts`: 15 vendors, 200 unique SKUs, deterministic |
| AC-11 Variety | ≥ 5 template families used across vendors. A snapshot test renders one doc per family (visual check in PR). | unit + manual | ✅ 6 families, 7 fonts, 4 date formats, 3 column orders, multi-page docs present. Visually checked (README thumbnails). ⚠️ Lines per set are 1–13, not 1–25 (design §10). |
| AC-12 Planted errors | With each rate at 1.0 in isolation, every set contains that error. Rates of 0 give clean sets. The summary counts equal the answer key's counts. | unit | ✅ `build-set.test.ts`: each type at rate 1.0 alone; rates 0 give clean sets; every planted error yields its exception. The summary table prints per run. |
| AC-13 Answer key | All 100 answer keys parse with `groundTruthSchema`. Impact-rule unit tests cover every row of the design §6.5 table, including the worked example ($10.00 + $1.60). | unit | ✅ All 100 keys parse. `truth.test.ts` covers every rule row plus the $11.60 example. Bboxes visually verified by overlay on a PDF and a rotated scan. |
| AC-14 Arithmetic | For all 100 sets: qty × price = line total, Σ = subtotal, totals add up (decimal math) | unit | ✅ `build-set.test.ts` over 100 sets (decimal math) |
| AC-15 Scans | At scan rate 0.2 on 100 sets, the PNG share is in 15–25%. Transformed bboxes fall within the image bounds. | unit | ✅ PNG share within 15–25% (60/292 = 20.5% for seed 42) |
| AC-16 Deterministic | Generate seed 42 twice into two temp dirs; every file's sha256 is equal. A different seed gives different hashes. | unit | ✅ Byte-identical across two runs; a different seed differs. Regenerating the CI subset from a fresh clone gives **0 changed files**. |
| AC-17 Golden set | `ci-subset.json` has 20 IDs. The subset covers every error type ≥ 2× and every template ≥ 1×. Files exist in `evals/golden-ci/`. | unit | ✅ `ci-subset.test.ts`: 20 sets, each error type ≥ 2, all 6 templates, PDF + PNG, clean sets. 6.2 MB. |
| AC-18 Speed | Time `pnpm generate --sets 100`; under 120 s locally. Recorded in the PR. | manual | ✅ 100 sets in 18.6–19.9 s locally (target 120 s) |
| AC-19 Docs | Review the README. `docs:check` passes. | manual + CI | ✅ README with quickstart, options, thumbnails, and answer-key excerpt. `docs:check` passes. |

## Eval impact
None. There's no eval harness until M2. M1 produces the data the evals will use.

## Manual demo steps
1. `corepack enable && pnpm install`
2. `docker compose up -d && pnpm db:migrate && pnpm db:seed`
3. `pnpm generate --seed 42 --sets 10 --out /tmp/reconcile-demo`
4. Open a set folder: view the PDFs and PNGs and read `ground_truth.json`.
   Find a planted short-ship on the documents by eye and compare it to the answer key.

## Results summary

Executed 2026-10-16.

- **18 of 19 criteria pass.** AC-4 is partial: CI is green, but the red-path demo was skipped.
- `pnpm test` gives **11 files, 53 tests passing**, locally and in CI (Ubuntu, Postgres 17 service).
- **Deviations** (documented in design §10): invoice-only vendor styling, 1–13 lines per set, fonts
  via npm, scans only for single-page documents, the incomplete-set rule, the duplicate rate raised to 0.08.
- **Not verified:** that PNG bytes match across operating systems. Accepted by design: CI never
  regenerates the committed subset.
