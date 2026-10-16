# M0: Requirements and design. Retrospective

- **Date:** 2026-10-16
- **Planned vs. actual:** delivered as planned: PRD, glossary, backlog,
  architecture, 6 ADRs, templates, and release v0.1.0. Added one requirement
  (`QTY_BILLED_NOT_RECEIVED`).

## What went well
- Writing the exception rules down exposed a real gap: "billed for goods that
  never arrived" was missing. It was caught on paper, at zero cost.
- Traceability was verified mechanically: all 18 FRs and 12 stories map to a
  milestone, and no relative links are broken.
- Designing around the free-tier LLM limit early (cache, shared limiter,
  replay CI) means M2–M3 won't need rework.

## What didn't
- **No GitHub remote yet**, so the "review" was a local merge with no PR, no
  CI, and no rendered diagrams.
- The 8 Mermaid diagrams haven't been render-checked. A syntax error would
  only show up on GitHub.
- The first learning log was too dense and had to be rewritten.
- The project lives in a temporary session folder, which isn't a durable home
  for a repo.

## Lessons
- Write for the reader: a learning doc that's hard to read teaches nothing.
- A gate without tooling (PR + CI) depends on discipline alone. Set up the
  tooling before code exists.

## Follow-ups (added to `backlog.md`)
- B-09: Create the GitHub repo and push `main` plus tags **before** M1's first PR.
- B-10: Add a docs check to CI (relative links, Mermaid syntax).
- B-11: Move the repo to a permanent folder.
