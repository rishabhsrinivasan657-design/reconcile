# Reconcile

An AI **3-way match** agent for distributors and CPG brands. It reconciles
**purchase orders**, **warehouse receiving reports**, and **supplier
invoices**, then flags short-ships, price mismatches, and other exceptions for
a human to approve, dispute, or write off.

> **Status: M1, foundation and synthetic data.** The repo, database, and a
> generator for realistic labeled test documents are in place. Extraction,
> matching, the UI, and the MCP server come in later milestones (see
> [the milestone list](docs/milestones/README.md)).

Everything runs locally for **$0**: Docker Compose (Postgres, Redis),
TypeScript end to end, and the Gemini free tier later on.

## Quickstart

Requirements: Node 24+, Docker. pnpm comes through Corepack, which ships with Node.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:migrate
pnpm db:seed
pnpm generate --sets 10 --out /tmp/reconcile-demo
```

If port 5432 is already taken on your machine, set `POSTGRES_PORT=5433` in
`.env` and change the port in both database URLs.

## The synthetic document generator

There are no real documents to work with, so the generator makes realistic
ones and **plants known mistakes** in them. Each document set comes with an
answer key (`ground_truth.json`). That gives demo data and a labeled
evaluation set at the same time.

```bash
pnpm generate --seed 42 --sets 100 --out evals/golden   # full golden set (not committed)
pnpm generate:ci                                        # rebuild the committed 20-set CI subset
pnpm generate:samples                                   # README thumbnails
```

| Option | Default | Meaning |
|---|---|---|
| `--seed` | `42` | Same seed gives byte-identical files |
| `--sets` | `100` | Number of document sets |
| `--out` | `evals/golden` | Output folder (old `S####` folders in it are replaced) |
| `--config` | none | JSON file overriding error rates, e.g. `{"errors": {"price_change": 0.5}}` |
| `--scan-rate` | `0.2` | Share of single-page documents output as PNG "scans" |

What a run looks like:

```
Planted errors
  short_ship_billed_full           10
  short_ship_billed_correctly       4
  over_ship                         7
  billed_not_received               9
  price_change                     15
  description_typo                 24
  sku_omitted                      12
  extra_invoice_line                7
  missing_document                  9
  ...
Documents
  clean sets      35
  documents      292
  PNG scans       60
Done in 18.6s
```

### What the documents look like

Purchase orders come from the buyer's ERP, and receiving reports from its
warehouse system. Invoices come in six vendor layouts, with different fonts,
column orders, header labels, and date formats.

| Purchase order | Receiving report | Invoice: classic | Invoice: modern |
|---|---|---|---|
| ![PO](docs/images/samples/po.png) | ![RR](docs/images/samples/rr.png) | ![classic](docs/images/samples/classic.png) | ![modern](docs/images/samples/modern.png) |

| Invoice: ERP printout | Invoice: two-column | Invoice: boxed form | Invoice: letterhead |
|---|---|---|---|
| ![erp](docs/images/samples/erp.png) | ![twocol](docs/images/samples/twocol.png) | ![boxed](docs/images/samples/boxed.png) | ![letterhead](docs/images/samples/letterhead.png) |

About 20% of documents are output as "scans": slightly rotated, blurred,
grayscale, and noisy.

### The answer key

Each set folder holds the documents plus `ground_truth.json`, which is
validated by the Zod schema in `packages/core`. Excerpt from
`evals/golden-ci/S0010`:

```jsonc
{
  "poNumber": "HP-PO-104157",
  "documents": [
    { "file": "inv-1.pdf", "template": "twocol", "fields": {
        "lines": [{ "sku": { "value": "NR-19263", "page": 1, "bbox": [0.0882, 0.3103, 0.1539, 0.3232] },
                    "qty": { "value": 45, "page": 1, "bbox": [0.6173, 0.3103, 0.634, 0.3232] }, "...": "..." }],
        "total": { "value": "43453.15", "page": 1, "bbox": [0.832, 0.6616, 0.9118, 0.6753] } } }
  ],
  "lineMatches": [{ "po": "po:1", "rr": "rr:6", "inv": "inv-1:1" }],
  "exceptions": [
    { "type": "SHORT_SHIP", "lineKeys": ["po:7", "rr:8", "inv-1:7"], "amount": "2329.70", "informational": false }
  ],
  "planted": [
    { "type": "short_ship_billed_full", "details": { "ordered": 48, "received": 38, "billed": 48 } }
  ]
}
```

- **Every field has its location**: the page number, and a bounding box
  normalized to `[0,1]` with the origin at the top-left. Scans get rotated boxes.
- **Expected exceptions** follow [PRD FR-09](docs/prd.md), which counts each
  billed unit once. They're computed from the planted errors, never by running
  a matcher ([ADR-0008](docs/adr/0008-generator-truth-from-planted-errors.md)).
- **Honest caveat:** synthetic documents are cleaner than real ones. Varied
  layouts, scans, typos, and abbreviations narrow that gap but don't close it.

## Repository layout

```
packages/core        Zod schemas (answer key, money, enums), env loader
packages/db          Prisma schema + migrations, append-only audit log, seed
packages/generator   Synthetic PO / RR / invoice generator
evals/golden-ci      Committed 20-set CI subset (the eval harness arrives in M2)
docs/                PRD, architecture, ADRs, milestone docs, learning log
```

## Commands

| Command | What it does |
|---|---|
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Quality checks (DB tests need `DATABASE_URL_TEST`) |
| `pnpm format` | Prettier |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Database |
| `pnpm docs:diagrams` | Re-render Mermaid diagrams to PNG after editing them |
| `pnpm docs:check` | Check links and diagram freshness (runs in CI) |

## How this project is built

The project follows a gated SDLC: requirements → design → implementation →
testing → review → release → retrospective, with a written artifact at each
step. Start with the [PRD](docs/prd.md), the [architecture](docs/architecture.md),
and the [learning log](docs/learning-log.md).
