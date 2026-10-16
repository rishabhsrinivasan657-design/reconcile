# M1: Foundation and synthetic data. Test plan

Written in the Design phase and executed in the Testing phase.

## Coverage map

| AC | How it's verified | Type | Result |
|---|---|---|---|
| AC-1 Clean setup | Fresh clone into a temp dir; run the README steps exactly as written | manual + CI (`test` job does migrate on an empty DB) | ⬜ |
| AC-2 Workspace | `pnpm -r list --depth -1` shows exactly core, db, generator, evals | manual | ⬜ |
| AC-3 Quality commands | `pnpm lint && pnpm typecheck && pnpm test` green. A fixture file importing `@prisma/client` from core makes lint fail. | CI + unit | ⬜ |
| AC-4 CI | The PR shows the `check` and `test` jobs green. A deliberately broken commit shows red, then is reverted. | CI | ⬜ |
| AC-5 Env | Unit: a missing or invalid `DATABASE_URL` throws a readable error | unit | ⬜ |
| AC-6 Schema | `prisma migrate deploy` on an empty DB succeeds. A unit test asserts money columns are `Decimal`. | integration | ⬜ |
| AC-7 Append-only | Integration: INSERT works; UPDATE and DELETE throw `append-only` | integration | ⬜ |
| AC-8 Seed | Run the seed twice; counts are unchanged (1 user, 15 vendors, ~200 items) | integration | ⬜ |
| AC-9 Command | Generate 10 sets; each folder has the expected files per its answer key | unit | ⬜ |
| AC-10 Catalog | 15 vendors, 190–210 SKUs, unique `(vendor, sku)`, prices > 0; same seed gives equal JSON | unit | ⬜ |
| AC-11 Variety | ≥ 5 template families used across vendors. A snapshot test renders one doc per family (visual check in PR). | unit + manual | ⬜ |
| AC-12 Planted errors | With each rate at 1.0 in isolation, every set contains that error. Rates of 0 give clean sets. The summary counts equal the answer key's counts. | unit | ⬜ |
| AC-13 Answer key | All 100 answer keys parse with `groundTruthSchema`. Impact-rule unit tests cover every row of the design §6.5 table, including the worked example ($10.00 + $1.60). | unit | ⬜ |
| AC-14 Arithmetic | For all 100 sets: qty × price = line total, Σ = subtotal, totals add up (decimal math) | unit | ⬜ |
| AC-15 Scans | At scan rate 0.2 on 100 sets, the PNG share is in 15–25%. Transformed bboxes fall within the image bounds. | unit | ⬜ |
| AC-16 Deterministic | Generate seed 42 twice into two temp dirs; every file's sha256 is equal. A different seed gives different hashes. | unit | ⬜ |
| AC-17 Golden set | `ci-subset.json` has 20 IDs. The subset covers every error type ≥ 2× and every template ≥ 1×. Files exist in `evals/golden-ci/`. | unit | ⬜ |
| AC-18 Speed | Time `pnpm generate --sets 100`; under 120 s locally. Recorded in the PR. | manual | ⬜ |
| AC-19 Docs | Review the README. `docs:check` passes. | manual + CI | ⬜ |

## Eval impact
None. There's no eval harness until M2. M1 produces the data the evals will use.

## Manual demo steps
1. `corepack enable && pnpm install`
2. `docker compose up -d && pnpm db:migrate && pnpm db:seed`
3. `pnpm generate --seed 42 --sets 10 --out /tmp/reconcile-demo`
4. Open a set folder: view the PDFs and PNGs and read `ground_truth.json`.
   Find a planted short-ship on the documents by eye and compare it to the answer key.

## Results summary
_Filled in during the Testing phase._
