# Architecture

| | |
|---|---|
| Status | **Approved** at the M0 Design gate (2026-10-16) |
| Last updated | 2026-10-16 |
| Requirements | [`prd.md`](prd.md) |
| Decisions | [`adr/`](adr/) |

This page shows **how** Reconcile is built. Diagrams are Mermaid (they render
on GitHub). Detailed per-milestone designs live in `milestones/Mx/design.md`
and must stay consistent with this page, or update it.

## 1. System context: who talks to Reconcile

```mermaid
flowchart LR
  clerk([AP clerk / manager]) -->|browser| R[Reconcile]
  mcp([AI assistant<br/>e.g. Claude Desktop]) -->|MCP, read-only| R
  R -->|extraction + fuzzy match| LLM[(LLM provider<br/>Gemini free tier · Ollama · Claude · OpenAI)]
  gen([Synthetic generator]) -->|PDFs + ground truth| R
```

Everything except the LLM provider runs on your machine. With Ollama, the
LLM runs locally too.

## 2. Containers: the moving parts

```mermaid
flowchart TB
  subgraph Apps
    web[apps/web<br/>Next.js UI]
    api[apps/api<br/>Fastify REST]
    worker[apps/worker<br/>BullMQ jobs]
    mcpsrv[packages/mcp<br/>MCP server · stdio]
  end
  subgraph Shared packages
    core[packages/core<br/>Zod schemas · matching engine · LLM client]
    db[packages/db<br/>Prisma client + migrations]
  end
  pg[(Postgres)]
  redis[(Redis<br/>queues + rate limiter)]
  fs[(Local file storage<br/>./storage)]
  llm[(LLM provider)]

  web -->|HTTP JSON| api
  api --> db --> pg
  api -->|enqueue| redis
  api --> fs
  worker -->|consume| redis
  worker --> core
  worker --> db
  worker --> fs
  core -->|via LLM client| llm
  core -.->|token bucket| redis
  mcpsrv --> db
```

| Part | Responsibility | Must NOT |
|---|---|---|
| `web` | UI only. Talks to `api` over HTTP. | touch the DB or queues directly |
| `api` | Validate requests, store files, write DB rows, enqueue jobs, record audit events | call the LLM (that's slow, so it belongs in the worker) |
| `worker` | Run the extract and match jobs | serve HTTP |
| `core` | Pure logic: schemas, matching, LLM client, prompts | import Prisma, Fastify, Next, or BullMQ |
| `db` | Schema, migrations, seed, typed client | contain business rules |
| `mcp` | Read-only tools over the DB | write anything |

## 3. Main flow: upload → exception

```mermaid
sequenceDiagram
  actor U as AP clerk
  participant W as web
  participant A as api
  participant Q as Redis (BullMQ)
  participant K as worker
  participant L as LLM
  participant D as Postgres

  U->>W: upload invoice.pdf
  W->>A: POST /documents
  A->>D: Document(status=UPLOADED, sha256) + AuditEvent
  A->>Q: enqueue extract(docId)
  Q->>K: extract job
  K->>L: page images + extract prompt (cache checked first)
  L-->>K: JSON fields + confidences + regions
  K->>K: Zod validate + arithmetic checks
  alt any field low-confidence or invalid
    K->>D: status=NEEDS_REVIEW
  else all good
    K->>D: status=READY
    K->>Q: enqueue match(poNumber)
  end
  Q->>K: match job
  K->>K: deterministic rules (SKU → qty → price)
  K->>L: fuzzy match for leftover lines only
  K->>D: MatchRun + LineMatches + Exceptions + AuditEvents
  U->>W: open exceptions queue
  U->>A: POST /exceptions/:id/actions {write_off, note}
  A->>D: update status + AuditEvent (append-only)
```

## 4. Lifecycles (state machines)

**Document**

```mermaid
stateDiagram-v2
  [*] --> UPLOADED
  UPLOADED --> EXTRACTING
  EXTRACTING --> NEEDS_REVIEW: low confidence / invalid
  EXTRACTING --> READY: all fields pass
  EXTRACTING --> FAILED: LLM error after retries
  FAILED --> EXTRACTING: retry
  NEEDS_REVIEW --> READY: human corrects/confirms fields
  READY --> MATCHED: match job ran
```

**Exception**

```mermaid
stateDiagram-v2
  [*] --> OPEN
  OPEN --> APPROVED: accept as billed
  OPEN --> DISPUTED: contest with supplier
  OPEN --> WRITTEN_OFF: accept the loss
  DISPUTED --> APPROVED
  DISPUTED --> WRITTEN_OFF
```

Every arrow writes an `AuditEvent`. Informational exceptions (e.g. a
correctly billed short-ship) start `OPEN` but are excluded from the default
queue view.

## 5. Data model (overview)

```mermaid
erDiagram
  Vendor ||--o{ CatalogItem : sells
  Vendor ||--o{ Document : issues
  DocumentSet ||--o{ Document : groups
  Document ||--o{ Extraction : "has versions"
  DocumentSet ||--o{ MatchRun : "matched by"
  MatchRun ||--o{ LineMatch : contains
  MatchRun ||--o{ Exception : raises
  Exception ||--o{ ExceptionAction : "decided by"
  User ||--o{ ExceptionAction : takes
  Document ||--o{ LlmCall : "costs"
  AuditEvent }o--|| User : "actor (or system)"
```

Key design points:
- **`DocumentSet`** = everything sharing a PO number. It's created when the
  first doc for that PO arrives, so a set can be incomplete (`MISSING_DOCUMENT`).
- **`Extraction` is versioned.** Re-extracting with a new prompt adds a row and
  never overwrites. Human corrections are stored as a new version with
  `source=HUMAN`.
- **`MatchRun` is versioned.** Re-matching creates a new run. Each exception
  has a **fingerprint** (type + PO + line keys), so a human decision on an
  exception carries over to the same exception in later runs instead of being lost.
- **`AuditEvent`** is append-only. A DB trigger rejects UPDATE and DELETE (ADR-0005).
- **`LlmCall`** has one row per LLM request, including cache hits (ADR-0002).
- Money columns are `Decimal(14,4)` (ADR-0004).

## 6. LLM client (inside `core`)

```mermaid
flowchart LR
  caller[extract / fuzzy-match] --> cache{cache hit?<br/>key = doc hash + prompt version + model}
  cache -->|yes| out[validated result]
  cache -->|no| rl[Redis token bucket<br/>shared by all workers]
  rl --> prov[provider adapter<br/>gemini · ollama · anthropic · openai]
  prov -->|429 / 5xx| retry[backoff + jitter<br/>honor Retry-After] --> rl
  prov --> zod[Zod parse] --> out
  zod -->|invalid JSON| repair[one repair retry] --> prov
  out --> log[(LlmCall row)]
```

Details are in ADR-0002. The provider is chosen by `LLM_PROVIDER`, and models
by `LLM_MODEL_EXTRACT` and `LLM_MODEL_MATCH`.

## 7. Matching engine (inside `core`)

A **pure function**: `match(set, config) → { lineMatches, exceptions }`. No
I/O, so it's easy to unit-test and evaluate. The fuzzy step is injected as a
function, so tests can stub it.

1. Check that the set has a PO, an RR, and an invoice. If one is missing past
   the grace period → `MISSING_DOCUMENT`.
2. Detect duplicate invoices → `DUPLICATE_INVOICE`.
3. Pair lines by normalized SKU.
4. Leftover lines → fuzzy matcher (LLM) → accept above a confidence
   threshold, keeping the reasoning. Still unpaired → `UNMATCHED_LINE`.
5. For each paired line, compare quantities and prices with tolerances →
   `SHORT_SHIP` / `OVER_SHIP` / `QTY_BILLED_NOT_RECEIVED` / `PRICE_VARIANCE`,
   each with a dollar impact and a generated explanation.

Details are in ADR-0003.

## 8. Evals pipeline

```mermaid
flowchart LR
  gen[generator<br/>seed=42] --> golden[(evals/golden<br/>PDFs + ground_truth.json)]
  golden --> ext[extract stage<br/>live or replay cache]
  golden -.->|--from-ground-truth| m
  ext --> m[match stage]
  m --> score[scorer vs ground truth]
  score --> table[summary table]
  score --> res[(results/*.json)]
  res --> cmp{vs baseline.json<br/>drop > 2 pts?}
  cmp -->|yes| fail[CI fails]
  cmp -->|no| pass[CI passes]
```

Details are in ADR-0006.

## 9. Deployment views

**Local (M1–M6):** `docker compose up -d` starts Postgres and Redis.
`pnpm dev` runs web, api, and worker on the host. File uploads go to `./storage`.

**Cloud (M7):** a single small EC2 instance runs the same compose stack, with
Terraform-managed networking and a budget alarm. That design is written at M7.

## 10. Cross-cutting concerns

| Concern | Approach |
|---|---|
| Config | Env validated by Zod at startup. `.env.example` lists every var. |
| Errors | Typed errors in `core`. The API maps them to RFC 7807 problem JSON. Jobs retry with backoff, then go to `FAILED`. |
| Idempotency | Extract jobs are keyed by `sha256 + promptVersion`, match jobs by `poNumber`. Re-running is safe. |
| Logging | Structured JSON logs (pino) with request/job ids |
| Security | Single seeded user. File type and size checks on upload. MCP is read-only. Secrets only in `.env`. |
| Testing | Unit tests next to the code (Vitest). One Playwright E2E. Evals are their own suite. |
