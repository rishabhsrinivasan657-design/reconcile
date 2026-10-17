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

---

## M1 · Implementation and testing (2026-10-16)

**In one line:** build in small, provable steps, then check every promise in the checklist.

**What we did:** 17 small commits (tooling → database → generator → docs), a
draft pull request with CI, then ran the test plan: 18 of 19 criteria fully pass.

**Key ideas**
- **Small commits.** Each commit does one thing and still works. If something
  breaks, you can find the exact step that broke it.
- **Spike first.** Before building the PDF engine, a 20-line throwaway test
  ("spike") proved the risky part worked (deterministic PDFs that turn into images).
  Cheap insurance against building on sand.
- **Tests at different levels.**
  - *Unit tests* check one piece in isolation (the dollar-impact formula).
  - *Integration tests* check pieces working together (the real database
    rejecting an edit to the audit log).
  - *Manual checks* catch what code can't easily judge (do the invoices look
    real? do the boxes sit on the text?).
- **Guardrails as tests.** "Core must not import the database" is enforced by a
  lint rule, and a test proves the rule works.
- **CI (Continuous Integration).** GitHub runs the checks on every push, on a
  clean machine. "Works on my laptop" becomes "works everywhere."
- **Deviations are written down, not hidden.** Real building always differs from
  the plan (a font that wouldn't embed, a rate too low). Design §10 records each
  difference and why.
- **Report honestly.** One criterion is only partly done (CI red-path demo), and
  the test plan says so.

**Remember:** "done" means proven against the checklist, not "I think it works."

---

## M1 · Review, release, and retro (2026-10-16)

**In one line:** approve, merge, tag v0.2.0, publish release notes, and learn from what went wrong.

**What we did:** marked PR #1 ready and merged it, tagged **v0.2.0**, published a
GitHub Release, and wrote the M1 retrospective.

**Key ideas**
- **Draft vs. ready PR.** "Draft" means "still working, don't review yet." "Ready"
  asks for review. The merge only happened after your approval at the gate.
- **MINOR version bump (0.1.0 → 0.2.0).** New features, nothing broken for users.
- **GitHub Release** = tag + human-readable notes, which visitors see on the repo page.
  Notes come straight from `CHANGELOG.md`, so there's one source of truth.
- **Retros find process problems, not just code problems.** The biggest lesson from
  M1 wasn't about code: a merge button quietly published your Gmail. Tools have
  defaults, and you only find them by looking.
- **Some fixes need a human.** Rewriting `main` was blocked by a safety rule. That's
  correct: force-pushing a shared branch is a decision for the owner, not the assistant.

**Remember:** every milestone ends with "what will we do differently next time?", and that goes in the backlog.

---

## M2 · Requirements (2026-10-17)

**In one line:** define what "good matching" means, as numbers, before writing the matcher.

**What we did:** wrote 15 acceptance criteria for the matching engine and the
eval harness (the scoreboard), plus three open questions.

**Key ideas**
- **Measure one thing at a time.** M2 feeds the matcher *perfect* data (the
  answer key) instead of what the AI reads from documents. If a score is bad, we
  know matching is to blame, not reading. Engineers call this *isolating the
  variable*.
- **Precision vs. recall, in plain words.**
  - *Precision:* of the problems we flagged, how many were real? Low precision
    means lots of false alarms that waste the clerk's time.
  - *Recall:* of the real problems, how many did we catch? Low recall means
    money leaks through unnoticed.
  - *F1* blends the two into one number.
- **A metric needs an exact definition.** "Line-match accuracy" is vague.
  "Precision/recall over PO–RR, PO–invoice, and RR–invoice links" isn't. Two
  people computing it get the same answer.
- **Baseline and regression gate.** Record today's scores (the *baseline*). CI
  then fails any change that drops a score by more than 2 points. Quality can go
  up freely but never quietly down.
- **Baseline first, then AI.** A simple non-AI matcher sets the bar (Q1). When
  the AI arrives in M4, we can say exactly how much it improves things, or
  whether it does at all.

**Remember:** if you can't measure it, you can't tell if a change helped.
