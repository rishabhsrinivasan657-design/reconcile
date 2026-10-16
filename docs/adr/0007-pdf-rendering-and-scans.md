# ADR-0007: Render PDFs with pdfkit; simulate scans with pdfjs + @napi-rs/canvas

- **Status:** Proposed
- **Date:** 2026-10-16
- **Requirements:** FR-15, NFR-01, NFR-05 · M1 AC-11, AC-15, AC-16

## Context
The generator must produce varied, realistic PDFs and scan-like images,
record where every field was drawn, and be byte-deterministic from a seed.
It must stay TypeScript, $0, and free of system dependencies.

## Options
1. **HTML → PDF via headless Chrome (Playwright).** Easy layouts with CSS,
   but heavy, slow for 100+ sets, hard to make byte-deterministic, and field
   boxes need DOM measuring.
2. **pdf-lib.** Deterministic and low-level, but no text layout or wrapping,
   so every table is manual.
3. **pdfkit.** Mature, embeds custom fonts, measures text, and supports fixed
   metadata. Layout is manual but manageable.
4. Scans via **sharp/ImageMagick.** Strong image ops, but needs a PDF
   rasterizer anyway (ImageMagick needs Ghostscript installed on the system).

## Decision
pdfkit for documents. Templates draw through a `drawField()` helper that
records normalized bboxes. Scans: `pdfjs-dist` renders the page onto an
`@napi-rs/canvas` canvas (prebuilt binaries), then seeded canvas operations
add rotation, blur, and noise, and bboxes are transformed by the same rotation.

## Consequences
- ➕ Pure npm install, works on macOS, Linux, and CI with no system packages.
- ➕ Exact field locations for free, because we draw them.
- ➖ Layout code is manual (six template functions).
- ➖ PNG bytes may differ across OS/architecture, so the committed CI subset is
  never regenerated in CI.
