# Learning log

A plain-language diary of how this project is built. Each entry covers one
step: **what we did, the idea behind it, and why real teams bother.**

## The SDLC in 30 seconds

Think of building a house:

| Phase | House version | Question it answers |
|---|---|---|
| 0. Planning | Budget, plot, rough timeline | *Should we build this, and roughly how?* |
| 1. Requirements | "3 bedrooms, 2 baths, under $X" | *What exactly do we need?* |
| 2. Design | Blueprints | *How will we build it?* |
| 3. Implementation | Construction | *Build it.* |
| 4. Testing | Inspection | *Does it work, and does it meet the requirements?* |
| 5. Review and release | Final walkthrough, hand over keys | *Is it good enough to ship?* |
| 6. Maintenance | Repairs | *Fix what breaks after launch.* |
| 7. Retrospective | "Next time, order the windows earlier" | *How do we get better?* |

**The big rule:** mistakes get more expensive the later you find them. Moving
a wall on a blueprint is free. Moving it after it's built is not. That's why
the early phases exist, and why each one ends with a **gate**: an approval
before moving on.

---

## M0 · Planning (2026-10-15)

**In one line:** decide the boundaries before building anything.

**What we did:** wrote `CLAUDE.md` (the rules of the project) and split the
work into milestones M0–M7.

**Key ideas**
- **Constraints first.** $0 budget, TypeScript, run locally. These rule out
  options early, so we don't waste time on them.
- **Milestones that each work on their own.** If the project stopped after
  any milestone, there'd still be something that works and can be demoed.
  That beats one giant "done at the end" plan.
- **Acceptance criteria.** A checklist that defines "done" for each milestone,
  so "are we done?" has a factual answer.

**Remember:** a plan is a set of boundaries, not a prediction.

---

## M0 · Requirements (2026-10-16)

**In one line:** write down *what* to build and *why*, but not *how*.

**What we did:** wrote the PRD (`prd.md`), a glossary, and a backlog. Then we
answered two open questions (Q1, Q2).

**Key ideas**
- **PRD (Product Requirements Document):** the single source of truth for what
  the product must do. The "how" waits for the Design phase.
- **Personas:** the people who use the product (e.g. an AP clerk). Requirements
  are written for them, not for the code.
- **Three layers of requirements**, from fuzzy to precise:
  1. **User story:** "As an AP clerk, I want to see exceptions sorted by dollar
     impact, so that I fix the costly ones first." It captures *value*.
  2. **Functional requirement (FR):** a testable behavior. "Each exception
     records its dollar impact."
  3. **Non-functional requirement (NFR):** a quality. "Costs $0 to run." "The
     audit log can't be edited."
- **IDs (US-01, FR-09…):** later, tests and PRs say "this implements FR-09."
  This is called **traceability**: every line of code traces back to a reason.
- **Assumptions and open questions are written down.** A silent assumption is a
  bug waiting to happen. Q1 is the proof: writing the rules out exposed a
  missing check, "billed for goods that never arrived", which became
  `QTY_BILLED_NOT_RECEIVED`.
- **Targets vs. gates:** targets are where we want to be ("F1 ≥ 0.95"). The CI
  gate only says "don't get worse than last time." Both are useful.
- **Backlog:** a parking lot for good ideas that aren't for now. It prevents
  **scope creep** (a project slowly growing until it never ships).

**Remember:** the cheapest bug fix is one made in a document.

---

## M0 · Design (2026-10-16)

**In one line:** draw the blueprints. Decide *how* we'll build it before writing code.

**What we did:** wrote `architecture.md` (diagrams of the system), six
**ADRs** (decision records), and templates for the docs every milestone will produce.

**Key ideas**
- **Zoom levels.** Architecture is shown like a map, from far to close:
  - *Context:* who uses the system and what it talks to.
  - *Containers:* the big running parts (web, api, worker, database).
  - *Flows and states:* what happens step by step, and the life of a document
    or exception (e.g. `OPEN → DISPUTED → WRITTEN_OFF`).
- **Separation of concerns.** Each part has one job and a list of things it
  must *not* do (e.g. the UI never touches the database). Clear borders keep
  bugs contained and code testable.
- **Pure core.** The business logic (`core`) does no I/O, so it can be tested
  instantly without servers. Think of it as the engine on a test bench, outside the car.
- **ADR (Architecture Decision Record).** A one-page note per big decision:
  *context → options → choice → trade-offs.* Six months later, it answers "why
  did we do it this way?" ADRs are never rewritten. A new one replaces an old one.
- **Trade-offs are explicit.** Every ADR lists the downsides (➖) we accept.
  There are no perfect choices, only conscious ones.
- **Design for the constraint.** The free-tier LLM limit shaped the design:
  a cache, a shared rate limiter, rules before AI, and replay-mode CI.
- **Templates.** Every milestone fills the same forms, so nothing gets skipped
  and docs stay comparable.

**Remember:** if you can't draw it or explain the trade-off, you're not ready to code it.

---

## M0 · Testing, review, release, and retro (2026-10-16)

**In one line:** check the work, approve it, ship it with a version number, then learn from it.

**What we did:** checked every doc link and confirmed each requirement maps
to a milestone. Merged the branch into `main`, tagged **v0.1.0**, and wrote a
retrospective.

**Key ideas**
- **Testing isn't just code.** For docs, "tests" are checks: links work, every
  requirement is traced. Automate the checks when you can, since computers
  don't get bored.
- **Review = a second pair of eyes before merging.** Here, that was your
  approval at the gate. Normally it happens on a pull request (PR).
- **Branch → merge.** Work happens on a side branch, so `main` always holds
  approved work only. `--no-ff` keeps a visible "merge" bubble in history,
  showing what shipped together.
- **Semantic Versioning (`MAJOR.MINOR.PATCH`).** `0.x` means "still early,
  things may change." Each milestone bumps MINOR (v0.2.0 next), and a bug fix
  bumps PATCH.
- **Tag + CHANGELOG = a release.** The tag marks the exact commit. The
  changelog tells humans what changed.
- **Retrospective:** what went well, what didn't, lessons, follow-ups. It's
  blameless and specific, and follow-ups go into the backlog so they actually
  happen.

**Remember:** shipping isn't the end of a cycle. The retro is what makes the next cycle better.

---

## M1 · Requirements and design (2026-10-16)

**In one line:** turn one milestone into a checklist (requirements), then a blueprint (design).

**What we did:** wrote 19 acceptance criteria for M1, a design covering
tooling, database, and the document generator, two new ADRs, and a test plan
that maps each criterion to a check.

**Key ideas**
- **Acceptance criteria (AC):** small, testable promises ("same seed gives
  identical files"). If you can't test it, rewrite it until you can.
- **The test plan is written during design, before code.** Deciding *how* to
  prove something forces the design to be provable.
- **Design finds requirement bugs.** Writing exact formulas showed that one
  short-ship could be counted twice (as `SHORT_SHIP` and as
  `QTY_BILLED_NOT_RECEIVED`). We caught it before any code existed. This is
  why requirements and design are separate phases.
- **Don't grade your own homework.** The answer key comes from the errors we
  planted, never from the matcher it will test.
- **Pin your versions.** "Latest" isn't always safe: TypeScript 7 would break
  the linter, and npm's "latest" Prisma is a release candidate. Pinning makes
  builds repeatable.
- **Determinism:** same input gives exactly the same output. It's what makes
  caching and fair comparisons possible.
- **YAGNI ("You Aren't Gonna Need It"):** no empty apps, no Turborepo until
  needed. Less to build, less to break.

**Remember:** an hour of design saves a day of rework.
