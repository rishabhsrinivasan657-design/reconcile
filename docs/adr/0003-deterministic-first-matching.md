# ADR-0003: Deterministic rules first; LLM only for fuzzy description matching

- **Status:** Accepted (2026-10-16)
- **Date:** 2026-10-16
- **Requirements:** FR-07, FR-08, FR-09, NFR-05, NFR-10

## Context
Line matching decides whether money is paid. It must be explainable,
repeatable, and cheap. Most lines share a SKU. A minority differ only in
wording ("Org Almnd Btr 12oz" vs "Organic Almond Butter 12 oz"), or the
invoice omits the SKU.

## Options
1. LLM matches everything. Flexible, but non-deterministic, costly under
   free-tier limits, and hard to audit.
2. Rules only (SKU plus string similarity). Deterministic, but brittle on
   abbreviations and typos.
3. **Rules first, then the LLM on the leftovers** with required reasoning.

## Decision
Option 3. Matching is a pure function `match(set, config, fuzzyMatcher)`:
SKU normalization → qty and price tolerance checks → leftover lines go to
`fuzzyMatcher`, which returns `{ candidateId | null, confidence, reasoning }`.
A match is accepted only above a configurable threshold. Every `LineMatch`
records its `method` (`SKU | FUZZY_LLM | MANUAL`) and any reasoning.
Tolerances (qty abs/%, price abs/%) live in config.

## Consequences
- ➕ Most decisions are reproducible and free. The LLM is the exception, not the rule.
- ➕ `explain_match` can always say *why*: a rule path or the LLM's reasoning.
- ➕ Matching can be evaluated on ground-truth input with no LLM (fuzzy stubbed or cached).
- ➖ The LLM fuzzy step adds latency and quota use for messy documents.
