# M3: LLM client and extraction. Retrospective

- **Date:** 2026-10-17
- **Release:** [v0.4.0](https://github.com/rishabhsrinivasan657-design/reconcile/releases/tag/v0.4.0) · [PR #4](https://github.com/rishabhsrinivasan657-design/reconcile/pull/4)
- **Planned vs. actual:** 18 acceptance criteria. 16 fully pass, AC-15 is partial
  (list-price cost, exception P/R, Flash comparison). 14 planned commits became 30. Most of
  the extra ones are fixes found by the first live runs, plus two provider switches.

## What went well
- **The scoreboard drove the work.** The first live run scored field F1 55.8. Four
  measured fixes reached 99.9, each confirmed by the next run.
- **One interface paid off.** OpenAI → Groq → Gemini were each a setting plus a small adapter
  fix, not a rewrite (ADR-0010's "keep LangChain thin" held up).
- **Cost discipline.** Cache-first and replay mode mean CI is free and re-runs cost nothing.
  The spend cap was never close.
- **The self-check retry** turned a failure the math checks had caught into a fix, by showing
  the model its own inconsistent totals.

## What didn't
- **Provider assumptions failed in production, not in design:**
  - An OpenAI account had no credit (two keys).
  - Groq's free vision model caps output at 1K tokens/min.
  - Gemini's schema mode rejects nullable types, and its Flash free quota ran out at 15 docs.

  None of this is in the docs pages we checked.
- **Secrets handling was messy:** three keys were pasted into chat, and a global `~/.zshrc` key
  silently overrode `.env`. We revoked or removed them and made the tools print the key's source.
- **I assumed a key format** ("Gemini keys start with AIza"). It was wrong for newer keys.
- **Some edits were declared done before they had applied** (a scripted edit failed silently
  once). It was caught and fixed in the same turn, but the lesson is to verify before reporting.
- **Confident, wrong answers remain:** one PO number and two dates, at high confidence, passed every check.

## Lessons
- Make **one cheap live call early** in any milestone that depends on an external service.
  Docs don't reveal quotas, credit, or schema quirks.
- Treat any key pasted in chat as burned. Keys go only in `.env`.
- Verify every change (tests or a grep) before saying it's done.
- Self-reported confidence doesn't catch confident errors. Cross-document checks do (B-17).

## Follow-ups (backlog)
- **B-17 (P1):** tolerant PO grouping (1-character difference, same vendor, flagged)
- **B-18 (P2):** date sanity checks (order, plausible year, day/month swap)
- **B-19 (P2):** re-record before each release (model drift)
- **B-20 (P2):** finish the `gemini-3.8-flash` comparison (resumes from cache)
