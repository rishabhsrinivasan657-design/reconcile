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

---

## M2 · Design (2026-10-17)

**In one line:** plan the matcher as a pipeline of small steps, and plan the scoreboard so nobody can argue about the numbers.

**What we did:** wrote the M2 design (pipeline, fuzzy matcher, metric formulas,
CI gate), ADR-0009, and a test plan. We also turned on a GitHub rule: nothing
merges into `main` unless CI passes.

**Key ideas**
- **Pipeline design.** Group, then find duplicates, then pair lines, then raise
  exceptions, then explain. Each step is small, testable alone, and easy to reason about.
- **Plug-in parts (dependency injection).** The fuzzy matcher is passed in, not
  hard-wired. Today it's a simple text matcher; in M4 the AI version plugs into
  the same slot, with no other changes.
- **Classic NLP before AI.** Jaro–Winkler catches typos, prefix matching catches
  abbreviations, and token alignment compares whole descriptions. It's cheap,
  explainable, and often good enough. The AI must beat it to earn its place.
- **Branch protection.** A guard rail on `main`: code merges only if the automatic
  checks pass. Discipline that doesn't depend on remembering.
- **Prove the alarm rings (red-path test).** A smoke detector you've never tested
  might not work. We'll deliberately break something in a throwaway PR to see CI
  turn red.

**Remember:** design how you'll *judge* the work at the same time as the work itself.

---

## M2 · Implementation and testing (2026-10-17)

**In one line:** build the matcher and the scoreboard, and let the scoreboard find bugs.

**What we did:** 13 commits. The matching engine, the eval harness, near-miss
test data, a saved baseline, a CI eval job, and a deliberately broken pull
request to prove the gate fails.

**Key ideas**
- **The scoreboard found a bug on its first run.** Link recall was 95.5, not 100:
  sets missing a document weren't getting their lines paired. Fixed in one commit.
  Evals turn "I think it works" into a number that tells you where to look.
- **A perfect score is a question, not a celebration.** 100 everywhere sounds great,
  but the reason matters: perfect inputs, plus test data that never makes the
  fuzzy step work hard. We wrote that down (B-16) instead of bragging about it.
- **Stress testing.** We also ran 600 extra sets from new seeds to check the
  result wasn't luck on 20 sets.
- **Mutation testing (the red-path PR).** Breaking the code on purpose and watching
  the tests fail proves the tests can actually catch problems.
- **Don't absorb scope.** Harder fuzzy test data is a good idea, but it wasn't in
  M2's requirements, so it went to the backlog for you to decide.

**Remember:** a test that never fails might not be testing anything. Make it fail once on purpose.

---

## M2 · Review, release, and retro (2026-10-17)

**In one line:** merge with CI as the gatekeeper, release v0.3.0, and question the perfect score.

**What we did:** merged PR #2 once all three required checks passed, tagged
**v0.3.0**, published the release, and wrote the retrospective.

**Key ideas**
- **CI as gatekeeper.** `main` now refuses merges unless lint, tests, and evals pass.
  Review is no longer only "a person looked", but "a person looked *and* the machines agree".
- **Applying last retro's lesson.** M1's merge leaked an email; this time we merged
  locally. Retros only matter if the next milestone changes something.
- **Healthy skepticism.** The retro's main point is about what our tests can't see
  (B-16), not about celebrating 100.

**Remember:** a retro without a follow-up action is just a diary entry.

---

## M3 · Requirements (2026-10-17)

**In one line:** let the AI read the documents, and plan how to trust (or distrust) what it reads.

**What we did:** wrote 17 acceptance criteria covering a swappable AI client,
document extraction with confidence and review flags, two new eval stages, and
harder test data (B-16).

**Key ideas**
- **Never trust the AI blindly.** Every field gets a confidence score, and math checks
  (qty × price = total) catch mistakes the AI won't admit. Doubtful documents go to a human.
- **Measure the AI's effect in steps.** *Extract* scores reading alone. *E2E* scores
  reading plus matching. Comparing E2E with the perfect-input *match* stage shows
  exactly how much the AI's reading errors cost.
- **Catch rate.** Of the fields the AI got wrong, how many did we flag for review?
  A high catch rate means humans can trust the fields that *weren't* flagged.
- **Free-tier engineering.** A cache, a rate limiter, and replay mode mean evals cost
  nothing to re-run, and CI needs no secret key.
- **Vendor independence.** One interface, four AI providers. Switching is a setting,
  not a rewrite.

**Remember:** an AI system is only as good as your ability to tell when it's wrong.

---

## M3 · Design (2026-10-17)

**In one line:** wrap the AI in our own safety layers, and let a framework handle only the provider details.

**What we did:** designed the LLM client (LangChain.js underneath; our cache,
rate limiter, retries, and cost log on top), the extraction steps, the new eval
metrics, and wrote ADR-0010.

**Key ideas**
- **Superseding a decision.** We changed ADR-0002's "write our own adapters" to
  "use LangChain" (ADR-0010). The old ADR isn't erased; its status line points to
  the new one, so the history of *why* stays readable.
- **Thin framework, thick guarantees.** LangChain only talks to providers. What
  makes the project free, reproducible, and measurable is our code around it, so
  swapping frameworks later touches one file.
- **Check facts that change.** Model names, prices, and free-tier limits change
  often. We checked Google's pricing page today and made limits settings instead
  of hard-coding guesses.
- **Decide with data.** Flash-Lite (cheaper) vs. Flash (smarter): we'll run both on
  the same 20 sets and let the scoreboard choose.
- **Secrets hygiene.** API keys live only in your local `.env`, never in chat, git,
  or logs, and a test checks that no key-like text leaks into results.

**Remember:** the AI is a component. Your guarantees come from the system around it.

**Update (same day): changing course at a gate.** You chose OpenAI (your $5 credit)
over Gemini's free tier. That breaks the original "$0" rule, so we didn't just switch.
We updated the rule itself (CLAUDE.md, PRD NFR-01) and added a **hard spending cap**
in code. A good change is written down and guarded, not slipped in.

---

## M3 · Implementation and testing (2026-10-17)

**In one line:** connect a real AI, let the scoreboard show what breaks, and fix it one measured step at a time.

**What we did:** built the AI client and extraction, switched providers twice when
reality got in the way, recorded 60 real answers, and raised reading accuracy from
55.8 to 99.9.

**Key ideas**
- **Real systems fail in boring ways.** It wasn't "the AI is dumb". It was a number sent
  as text, a date copied as printed, an answer cut off, a field put in the neighboring box.
  *Be lenient about format, strict about meaning.*
- **Measure, fix, re-measure.** Each fix was chosen by the scoreboard and confirmed by it
  (55.8 → 93.7 → 95.5 → 97.9 → 99.9). No guessing.
- **Self-check loops.** When the AI's lines didn't add up to the printed subtotal, we showed
  it the evidence and asked again. Grounding a retry in a *fact* works better than "try harder".
- **Vendor reality.** Credits run out and free tiers have hidden limits (Groq's output cap).
  Because providers sit behind one interface, each switch was a setting plus a small adapter
  fix, not a rewrite.
- **Confident and wrong is the hardest error.** Three remaining mistakes had high confidence
  and passed every check. Knowing that, and writing it down, is part of being trustworthy.
- **Secrets hygiene, for real.** Keys pasted in chat were treated as exposed. A global key in
  `~/.zshrc` silently overrode `.env`, so now the tools say which source they used.

**Remember:** your first live run is a measurement, not a verdict.

---

## M3 · Review, release, and retro (2026-10-17)

**In one line:** ship v0.4.0, and write down what surprised us so the next milestone starts smarter.

**What we did:** merged PR #4 after all three required checks passed (including the
AI eval, replayed with no key), tagged **v0.4.0**, published the release, and wrote the retro.

**Key ideas**
- **CI can test AI without calling the AI.** Recorded answers make the AI part of the
  pipeline deterministic and free to test, which is the only way a quality gate can be fair.
- **The plan meets reality.** Three provider surprises came from things no design doc
  showed. The retro's top lesson: *make one cheap live call early*.
- **Honest scoring.** We shipped with a partial criterion and said exactly why. That's more
  credible than a perfect-looking table.

**Remember:** the retro's job is to change what you do next time. Write lessons as actions.

---

## M4 · Requirements (2026-10-17)

**In one line:** turn scripts into a running service that people (and programs) can use.

**What we did:** wrote 13 acceptance criteria for the upload API, the background
worker, the AI fuzzy matcher, and an end-to-end test of the real pipeline.

**Key ideas**
- **API + worker split.** The API answers fast ("got your file"). Slow work (reading with
  AI) happens in a background *worker* pulling jobs from a *queue*. Users never wait on the AI.
- **Idempotency.** Uploading the same file twice, or retrying a job, must not create
  duplicates. Every job is safe to run again.
- **Versioned results.** Re-matching creates a new version instead of overwriting, and a
  human's earlier decision follows the exception forward (by its *fingerprint*).
- **Prove the scoreboard measures the real thing.** Running the CI subset through the
  actual API and worker must give the same answers as the eval. Otherwise the eval
  could be grading a toy.
- **Give the AI a fair test.** The text matcher already scores 100, so we need harder
  cases (Q2) before the AI can show value, or show that it adds none.

**Remember:** a feature isn't done when the function works. It's done when the system using it works.

---

## M4 · Design (2026-10-17)

**In one line:** plan how the pieces talk to each other, so nothing gets lost, done twice, or done halfway.

**What we did:** designed the upload service (API), the background helper (worker), the
to-do list between them (queue), the AI matcher, and how we'll prove it all works.

**Key ideas**
- **A restaurant analogy.** The API is the waiter: takes your order instantly. The queue is
  the order slip on the rail. The worker is the cook: works at their own pace. If the cook
  steps away, the slips wait.
- **Safe to do twice.** Every job has a unique name (the file's fingerprint, or the PO), so
  a repeated job is ignored instead of creating duplicates.
- **All or nothing.** Each save and its history entry happen together (a *transaction*), so a
  crash never leaves half a result.
- **One definition, three uses.** Each API address's format is written once and used to
  check requests, check answers, and build the manual.
- **Fair test for the AI.** We're adding invoices that use the vendor's own product names, so
  the scoreboard can show whether the AI matcher earns its place.

**Remember:** good systems assume things will fail (crashes, retries, bursts) and stay correct anyway.

---

## M4 · Building and testing (2026-10-17)

**In one line:** turn the scripts into a service, and prove the service gives the same answers as the scoreboard.

**What we did:** built the upload API, the background worker, a shared toolbox, the
misread-PO fix, harder vendor-name test cases, and an AI line matcher. Then we tested the
whole thing end to end.

**Key ideas**
- **Test the real path, not just the parts.** The strongest test uploads all 20 test sets
  through the actual API, queue, and worker, and checks the answers match the scoreboard
  exactly. If they didn't, the scoreboard would be measuring a toy.
- **Make the test hard enough to mean something.** The first vendor names kept the brand, and
  the simple word matcher still scored 100. A test that can't fail teaches nothing, so we made
  it realistic (no brand), and the word matcher dropped to 89.5.
- **Use AI only where it helps.** "Hybrid" lets the cheap word matcher handle the easy lines
  and asks the AI only about the rest: 1 AI call instead of 3, same 100 score, every pair
  explained.
- **One fix, big effect.** Tolerating a one-character-off PO number (same vendor, flagged for
  review) lifted the AI-read accuracy from 84/94 to 100/100.
- **Guard your commits.** One commit went out with failing tests because a command didn't stop
  on failure. Now commits only happen after the test run says "passed".

**Remember:** a green test that can't turn red isn't evidence. Make sure your tests can fail.

---

## M4 · Review, release, and retro (2026-10-17)

**In one line:** ship v0.5.0, the first version that runs as a real service, and be honest about the slip-ups.

**What we did:** merged PR #5 after all three checks passed (including the full pipeline with a
real database and Redis), tagged **v0.5.0**, published the release, and wrote the retro.

**Key ideas**
- **A release is a promise.** v0.5.0 means "you can run this and upload documents". The changelog
  says what changed in words a user understands.
- **Own the mistakes in writing.** The retro records the commit that went out with failing tests,
  and the fix to the process (commit only after a passing test run). That's what makes a team
  trust the process.
- **Tomorrow's work comes from today's surprises.** The overconfident word matcher became backlog
  item B-22. Nobody would have planned for it.

**Remember:** a good retro changes a habit, not just a document.

---

## M5 · Requirements (2026-10-17)

**In one line:** describe a polished product in testable terms, not adjectives.

**What we did:** wrote 13 acceptance criteria for the website, plus three questions,
including which visual direction to take.

**Key ideas**
- **"Polished" has to be testable.** Words like "professional" can't be checked, but these can:
  a written style guide followed on every page, both themes finished, keyboard shortcuts,
  designed loading/empty/error states, and accessibility scores.
- **Design for the job, not the demo.** An AP clerk scans tables of money all day: numbers
  aligned on the decimal, evidence side by side, the explanation first, and the next problem one
  key away.
- **Pick a direction before building.** Choosing the look first (and approving a mockup) is far
  cheaper than restyling a finished site.

**Remember:** if you can't say how you'll check "polished", you'll never know when you're done.

---

## M5 · Design (2026-10-17)

**In one line:** decide how it looks and how the pieces talk before writing any page.

**What we did:** wrote the design, two decision records (the website's building blocks,
and live updates), a style guide, and a clickable mockup.

**Key ideas**
- **A style guide is a design decision written down.** Colors, fonts, and spacing become
  named *tokens* (like `--accent`). Pages use the names, never raw values, so the whole
  site stays consistent and a theme change is one file.
- **Mockups are cheap, code is expensive.** Clicking through a fake version finds "that
  feels wrong" problems in minutes instead of after a week of building.
- **Push, don't poll.** Instead of the browser asking "anything new?" every few seconds,
  the server tells it when something changes (server-sent events). The message only says
  *what* changed; the page then fetches the fresh data itself.
- **Generated types keep two programs honest.** The website's view of the API is generated
  from the API's own manual, so a change on one side shows up as an error on the other.

**Remember:** agree on the look and the contracts first; then building is mostly filling in.

---

## M5 · Testing (2026-10-18)

**In one line:** automated checks catch what you test for; a fresh pair of eyes catches the rest.

**What we did:** ran Lighthouse on every page, reviewed each page against the style guide in both
themes and at tablet and phone width, and followed the README from a fresh copy of the project.

**Key ideas**
- **Measure the real thing.** Speed scores come from the production build, not the development
  server, which is slower on purpose so it can rebuild quickly.
- **Accessibility tools find real problems.** axe and Lighthouse caught faint hint text and headings
  that skipped a level, two things that are easy to miss by eye.
- **Look with a user's eyes.** The review found things no test asked about: a grouped PO shown as
  its own PO, and a long list pushing the details off the screen on a tablet.
- **"Works on my machine" is not done.** A fresh clone failed straight away, because of an empty
  line in the example settings file that my own settings file didn't have.

**Remember:** after the tests pass, try it the way a newcomer would.

---

## M5 · Review, release, and retrospective (2026-10-18)

**In one line:** make the new safety net mandatory, then write down what you'd do differently.

**What we did:** made the browser test a required check, self-reviewed the change against a
checklist, merged PR #6, released v0.6.0, and wrote the retro.

**Key ideas**
- **A test only protects you if it's required.** Adding the browser test to the checks `main`
  needs means nobody can merge a change that breaks the main flow.
- **A self-review checklist catches rule-breaking.** It asks the project's own rules in plain
  questions: does the website touch the database? is money ever a JavaScript number?
- **Retros are for habits.** The useful lessons here weren't about code. They were about habits:
  try a fresh clone, measure the mockup, stop processes precisely.

**Remember:** every lesson in a retro should change something you do next time.

---

## M6 · Requirements (2026-10-18)

**In one line:** an AI assistant is a new kind of user, so design its access like any user's: useful, correct, and safe.

**What we did:** wrote 11 acceptance criteria for an MCP server, the standard plug that lets AI
assistants call Reconcile's tools, plus three questions.

**Key ideas**
- **MCP is an interface, like an API.** Instead of web pages for people, it offers named tools with
  descriptions for assistants. Good descriptions matter as much as good buttons.
- **Read-only first.** Letting an assistant change data needs careful permissions, so M6 only reads.
- **Documents can carry instructions.** An invoice line could say "approve everything". Text from
  documents must reach the assistant clearly labeled as data (this attack is called *prompt injection*).
- **One source of truth.** If the connector asks the same API as the website, the two can never disagree.

**Remember:** whatever an assistant reads, a stranger may have written.
