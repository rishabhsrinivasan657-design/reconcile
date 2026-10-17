# M5: The website. Requirements

- **Status:** Approved 2026-10-17 (look A "Ledger", real-time updates, automatic re-match)
- **Links to the PRD:** US-03, US-04, US-05, US-07, US-08, US-09, US-10 · FR-05, FR-11, FR-12
- **Release when done:** v0.6.0

## In one sentence

An accounts-payable clerk opens Reconcile in their browser, sees **how much money
is at risk**, works through the problems one by one with the evidence side by side,
and decides on each one, in a tool that feels as polished as the best finance
software they use.

## What "polished and professional" means here

"Not generic" isn't a vibe; these are concrete goals the design must meet:

- **Its own visual identity**: a deliberate typeface pairing, a restrained color
  palette with one accent, numbers in a font made for figures, and a logo mark. Not
  default component-library styling.
- **Built for the real job**: dense, scannable tables; dollar amounts aligned on
  the decimal point; the original document and what the AI read **side by side**;
  the problem's explanation in plain English at the top.
- **Fast to use**: keyboard shortcuts for the common moves (next problem, approve,
  dispute, write off), instant feedback after each action, and no full-page reloads.
- **Finished details**: loading skeletons, helpful empty states ("No open problems,
  nice work"), clear error messages, a light and a dark theme, and correct behavior
  on a laptop screen and a tablet.
- **Accessible**: works with the keyboard alone, readable contrast, and screen-reader labels.

## Pages

| Page | What the clerk does there |
|---|---|
| **Overview** | Sees money at risk, open problems by type, POs waiting or needing review, recent activity, and AI cost and speed |
| **Problems** (the main work queue) | Goes through problems sorted by dollar impact: the explanation, the lines from the PO, receiving report, and invoice side by side, and a decision with a note |
| **POs** | Lists every PO with its status. One PO shows its documents, how each line was matched (by SKU, by wording, or by the AI with its reason), its problems, any notes ("PO number looked misread"), and its full history. |
| **Document** | The original page with the AI's readings **highlighted on the image**, each field's confidence, the unsure fields marked, and the option to correct a field |
| **Review** | Documents the AI was unsure about, so they can be checked and corrected |
| **Upload** | Drag and drop several files, then watch each one move through *uploaded, reading, ready, matched* live |

## User stories

| ID | Who | Wants to… | So that… |
|---|---|---|---|
| US-03 | AP clerk | upload documents from the browser | no one types anything in |
| US-04 | AP clerk | see the AI's readings highlighted on the original document | they can trust or correct them quickly |
| US-05 | AP clerk | review only the fields the AI was unsure about | they don't re-check everything |
| US-07 | AP clerk | see problems sorted by dollar impact, with explanations | the costliest ones get fixed first |
| US-08 | AP clerk | approve, dispute, or write off a problem with a note | the decision is recorded and the PO can close |
| US-09 | Auditor | see the full history of a PO | every decision can be verified |
| US-10 | Manager | see AI cost and speed per document | they know what the automation costs |

## What "done" means (acceptance criteria)

### A. Doing the work
- [ ] **AC-1 Decide on a problem.** Approve, dispute, or write off any problem, with a
  **required note**. The decision is saved, written to the history, and shown at once.
  A decided problem leaves the "open" list.
- [ ] **AC-2 Correct a field.** On the document page, the clerk can fix a field the AI
  got wrong. That saves a new, human-made version (the AI's version is kept), and the PO
  is re-matched automatically. The problem list updates to match.
- [ ] **AC-3 Upload and watch.** Upload several files at once by dragging them in, and
  see each file's status update live without refreshing.

### B. Seeing the evidence
- [ ] **AC-4 Highlights on the original.** The document page shows the page image with
  a box around every field the AI read. Hovering or selecting a field highlights its box,
  and unsure fields are visibly marked.
- [ ] **AC-5 Side by side.** A problem's detail shows the matching lines from the PO,
  the receiving report, and the invoice next to each other, with the differences
  (quantity, price) emphasized, plus the plain-English explanation and the dollar amount.
- [ ] **AC-6 History.** Each PO has a timeline of everything that happened: uploaded,
  read, flagged, matched, problems raised, and each human decision with who made it,
  when, and the note.
- [ ] **AC-7 Overview numbers.** The overview shows money at risk (open, non-informational
  problems), counts by type and status, POs waiting or needing review, and AI cost and
  speed per document, all matching the database.

### C. Quality of the experience
- [ ] **AC-8 Visual identity.** A written mini style guide (typefaces, colors, spacing,
  number formatting, components) is followed on every page, and both light and dark
  themes are finished.
- [ ] **AC-9 Keyboard.** The common moves work without a mouse, and a `?` key shows the shortcuts.
- [ ] **AC-10 States.** Every page has designed loading, empty, and error states.
- [ ] **AC-11 Accessibility and speed.** Automated checks report no serious accessibility
  problems, and pages open quickly on the local machine (a Lighthouse score of at least
  90 for accessibility and performance on the main pages).

### D. Proof
- [ ] **AC-12 One end-to-end browser test.** An automated browser (Playwright) uploads a
  document set, waits for processing, opens the top problem, writes it off with a note,
  and finds the decision in the PO's history. It runs in CI using recorded AI answers.
- [ ] **AC-13 Instructions.** The README shows how to open the website, with screenshots.

## Not in M5
- Logins and roles (there's still one built-in user, shown by name in the corner)
- Email or chat notifications, exporting reports, editing vendors or the catalog
- The AI-assistant connector (M6), deployment (M7)

## Things we're assuming
- The website (Next.js, in `apps/web`) talks only to our API. M5 adds the API
  addresses it needs: record a decision, correct a field, PO history, overview numbers,
  and a live status feed.
- It's designed for laptop and desktop screens first, and works on a tablet. Phones get a
  readable but simplified view.

## Questions (answered 2026-10-17)

- **Q1. Which look should Reconcile have?** I'll turn your pick into a clickable mockup
  for approval at the Design gate, before building:
  - **A: "Ledger"**. Calm and editorial. Warm off-white "paper", ink-dark text, one deep
    teal accent, a refined serif for headings with a clean sans for everything else. It
    feels like trustworthy finance software.
  - **B: "Control room"**. Dark-first, dense, and fast, like Linear. Sharp sans-serif, a
    single electric accent, built around the keyboard.
  - **C: "Modern fintech"**. Bright and crisp, like Stripe or Ramp. White surfaces, an
    indigo accent, soft depth, generous spacing.
  - *I recommend A*: it stands out from the many dark "dev tool" designs, and it suits
    a finance audience.
  - **Answer: A, "Ledger".**
- **Q2. Live updates: real-time or refresh every few seconds?** *I recommend real-time*
  (the server pushes status changes). It's a small addition and makes the upload page feel alive.
  **Answer: real-time.**
- **Q3. Correcting a field re-matches the PO automatically?** *I recommend yes*, with a
  short "re-matching…" indicator, so the problem list is never out of date. **Answer: yes.**
