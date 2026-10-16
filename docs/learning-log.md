# Learning log

One entry per SDLC phase: what we did, the concept behind it, and why real
teams do it.

---

## M0 · Phase 0: Planning (2026-10-15)

**What we did:** Wrote `CLAUDE.md` (constraints, architecture sketch, working
agreement) and a milestone plan with acceptance criteria.

**Concept:** *Planning* fixes the boundaries before anyone builds: budget
($0), tech stack, what's in and out of scope, and the order of delivery.
Splitting work into **independently shippable milestones** means that if the
project stops at any point, you still have something that works and can be
demoed.

**Why teams do it:** Without it, projects drift. Each milestone having
acceptance criteria answers "are we done?" with a checklist instead of a feeling.

---

## M0 · Phase 1: Requirements (2026-10-16)

**What we did:** Wrote the PRD (`docs/prd.md`), the glossary, and the backlog.

**Concepts:**
- **PRD (Product Requirements Document):** says *what* to build and *why*,
  never *how*. The "how" belongs in the design phase.
- **Personas → user stories → functional requirements.** A user story ("As an
  AP clerk I want… so that…") captures value from the user's view. Functional
  requirements (FR-xx) are the precise, testable behaviors that deliver it.
  Non-functional requirements (NFR-xx) are qualities: cost, performance,
  auditability.
- **Stable IDs and traceability:** every story and requirement gets an ID, and
  later design docs, tests, and PRs cite those IDs. That lets you answer "why
  does this code exist?" and "is every requirement tested?"
- **Assumptions and open questions are written down**, not left implicit. An
  unrecorded assumption is a future bug.
- **Success metrics vs. regression gates:** absolute targets say where we want
  to be. The CI gate only says "don't get worse." Both are useful, for different jobs.
- **Backlog:** a parking lot that keeps scope creep out of the current milestone
  without losing good ideas.

**Why teams do it:** Changing a requirement on paper costs minutes. Changing it
after it's coded, tested, and deployed costs days. The Requirements gate is the
cheapest place to catch a misunderstanding.
