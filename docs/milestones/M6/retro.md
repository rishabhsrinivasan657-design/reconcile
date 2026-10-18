# M6: The AI-assistant connector (MCP server). Retrospective

- **Date:** 2026-10-18
- **Release:** [v0.7.0](https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.7.0) · [PR #7](https://github.com/rishabhsrinivasan657-design/reconcile/pull/7)
- **Plan vs. reality:** 11 criteria, all pass. We planned 7 commits and made 11 (plus docs).

## What went well
- **Reading through the API paid off at once.** The connector reused every explanation and history
  sentence the website already had, and the end-to-end test could simply compare the two.
- **Safe by construction.** The connector's client has only `GET`; no test was needed to keep writes
  out, only one to prove it.
- **The shared client move was painless.** Because both apps type-check against generated API types,
  moving the client was a mechanical change; the website's browser test confirmed nothing broke.
- **The demo caught what tests couldn't.** A real assistant showed that Claude Code reads the
  structured part of answers, where our injection marks weren't. That's now fixed and tested.

## What didn't
- **"It connects" was only true in the repo folder.** Starting the connector through `pnpm` failed
  from other folders (a different pnpm version, files expected in the home folder). Only the
  sandboxed connect check revealed it.
- **The defense was designed for one reading path.** The «…» marks lived only in the text summary;
  we assumed assistants read the text. They may read either part, so safety signals must be in both.
- **The headless demo wasn't possible.** Claude Code outside the desktop app isn't signed in, so the
  demo ran in a separate session that you approved. Fine, but worth knowing for the future.
- **Small test-writing slips.** Two expected values in new tests were computed wrong (the tools were
  right). Cheap to catch, but a reminder to compute expected numbers carefully.

## Lessons
- Test a connector **from where its users start it**, not from the repo.
- Put safety signals **in every form of an answer** a client might read.
- A real assistant conversation is a test, not just a demo: it finds what unit tests can't.

## Follow-ups (backlog)
- **B-26 (P2):** the API reads `includeInformational=false` as true
- **B-24 (P2), B-25 (P3), B-22 (P1), B-21 (P2):** still open from M4 and M5
- Tools that change things (approve, dispute) were left out of M6 on purpose; revisit with a
  permission design if needed
