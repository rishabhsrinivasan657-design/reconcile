# ADR-0010: LangChain.js for provider switching, under our own client

- **Status:** Accepted (2026-10-17)
- **Date:** 2026-10-17
- **Supersedes:** the "own adapters per provider" part of [ADR-0002](0002-llm-provider-interface.md). Its cache, limiter, retry, validation, and logging decisions still stand.
- **Requirements:** NFR-04, FR-18 · M3 AC-1, decision Q4

## Context
ADR-0002 chose hand-written adapters for Gemini, Ollama, Anthropic, and OpenAI.
At the M3 Requirements gate the owner asked to use LangChain or LangGraph for
switching providers instead. LangChain is widely recognized, which adds
portfolio value, and it removes four adapters' worth of HTTP code.

## Options
1. **Keep hand-written adapters** (ADR-0002). No dependency and full control, but
   more code to maintain.
2. **Vercel AI SDK.** Light and TypeScript-first, with strong Zod structured output.
3. **LangChain.js chat models** (`@langchain/google-genai`, `/openai`,
   `/anthropic`, `/ollama`) with `withStructuredOutput`.
4. **LangGraph.** An agent/state-machine framework. M3 is a single call per
   document, with no graph to model.

## Decision
Option 3, the owner's choice. LangChain is used **only** for "talk to provider X
with images and get structured output". Everything that makes the project $0
and measurable stays ours, wrapped around it: cache, rate limiter, retry,
Zod re-validation, cost table, call log, and replay. LangChain's own retries
are disabled. All LangChain imports live in one file (`providers.ts`).

LangGraph isn't adopted now. It's reconsidered if a multi-step agent arrives
(e.g. an exception-investigation agent).

## Consequences
- ➕ Switching providers is still one env var, with less HTTP code of our own.
- ➕ A recognizable framework on the resume, used with discipline (thin and isolated).
- ➖ A heavier dependency tree and frequent releases. Versions are pinned and
  upgrades are deliberate.
- ➖ Another layer when debugging provider errors. Mitigation: the raw message is
  kept (`includeRaw`), and errors are logged with the provider's status code.
