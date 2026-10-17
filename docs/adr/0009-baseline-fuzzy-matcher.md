# ADR-0009: A non-AI text-similarity matcher as the fuzzy baseline

- **Status:** Proposed
- **Date:** 2026-10-17
- **Requirements:** FR-08, NFR-05, NFR-10 · M2 AC-3, decision Q1

## Context
Some invoice lines have no SKU or a reworded description ("Org Almnd Btr 12oz"
vs "Organic Almond Butter, 12 oz"). ADR-0003 sends those leftovers to a fuzzy
matcher, with the LLM planned for M4. Until then we need *something*. We also
want a fair yardstick to prove what the LLM adds later.

## Options
1. **Leave leftovers unmatched until M4.** Zero work, but M2's scores would be
   artificially low, and M4 would have nothing to compare against.
2. **A library** (e.g. Fuse.js, string-similarity). Quick, but generic scoring,
   with no handling of sizes/units or abbreviations, and less explainable.
3. **A small hand-written matcher** using standard techniques: normalization,
   Jaro–Winkler for typos, prefix/subsequence for abbreviations, Monge–Elkan
   token alignment, and strict numeric (size) agreement.
4. **Embeddings** (sentence vectors). Strong, but it needs a model download or a
   paid API, and it's another AI component to evaluate.

## Decision
Option 3, behind the `FuzzyMatcher` interface. It's deterministic, free, has no
dependencies, and returns a reason string. It must **not** use the generator's
abbreviation list (ADR-0008); only generic rules apply. The M4 LLM matcher
implements the same interface and is compared against this baseline on the same
eval.

## Consequences
- ➕ M2 scores are realistic and reproducible. M4 gets a clear "AI vs. no AI" comparison.
- ➕ Every fuzzy pair can explain itself (NFR-10).
- ➖ It will miss pairs that need world knowledge (e.g. "Bkfst" → "Breakfast" when
  two candidates are similar). That's the LLM's job in M4.
- ➖ Around 150 lines of string code to maintain and test.
