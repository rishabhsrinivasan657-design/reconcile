# ADR-0012: How the website is built

- **Status:** Proposed
- **Date:** 2026-10-17
- **Requirements:** M5 AC-1 … AC-13, FR-11, FR-12

## Context
The website is what people will judge the project by. It has to look like its own
product (not a default template), stay in sync with the API as both change, work with
the keyboard and screen readers, and cost nothing to build or run.

## Options
1. **Next.js + a ready-made component kit (e.g. shadcn/ui or MUI):** fast to start /
   looks like thousands of other apps, and restyling a kit deeply is slow.
2. **Next.js + Tailwind:** quick styling / class soup in every file, and design rules
   end up scattered instead of written once.
3. **Next.js + plain CSS with design tokens + unstyled accessible primitives (Radix):**
   full control of the look, one place for every color and size, keyboard behavior done
   right / we write more CSS ourselves.

## Decision
Option 3. **Next.js 16** (App Router) in `apps/web`, styled with **CSS variables as
design tokens** and CSS Modules, **Radix UI primitives** for dialogs, menus, and tooltips,
**TanStack Query** for loading and caching data, and an API client **generated from the
API's OpenAPI manual** (`openapi-typescript` + `openapi-fetch`). Fonts come from
`@fontsource` packages, so builds need no network. The website talks only to the API,
never to the database.

## Consequences
- ➕ A distinctive, consistent look, written down once in `docs/style-guide.md`.
- ➕ If the API changes shape, the website fails to type-check instead of breaking quietly.
- ➕ All rules and history logging stay in the API, so the coming AI-assistant connector
  (M6) and the website behave the same.
- ➖ More hand-written CSS and components than with a kit.
- ➖ Two hops for each page (browser → website → API). Fine on one machine; revisit if
  deployed far apart.
