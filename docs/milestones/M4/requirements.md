# M4: Upload, background processing, and AI matching. Requirements

- **Status:** Draft, waiting for your approval
- **Links to the PRD:** US-03, US-06 · FR-01, FR-02, FR-05, FR-06, FR-08, FR-12, FR-13
- **Release when done:** v0.5.0

## In one sentence

Right now Reconcile only runs as commands you type. After M4, it's a **service
that runs on its own**: you upload a document, and Reconcile reads it, files it,
matches it, and saves the results, all automatically.

## How it will work

1. **You upload** a PDF or photo of a document.
2. Reconcile **saves the file** and puts it in a **to-do line** (a *queue*).
3. A **helper program** (the *worker*) picks up the next document, **reads it
   with the AI**, and figures out which PO it belongs to.
4. When a PO has its documents, the worker **matches them** and saves the
   problems it finds (the *exceptions*).
5. Anyone, including the website in M5, can **ask Reconcile for the results**
   through its *API* (a set of web addresses that return data).

The upload is answered instantly, and the slow AI reading happens in the
background. That's why there's a separate worker: nobody waits on the AI.

## User stories

| ID | Who | Wants to… | So that… |
|---|---|---|---|
| US-03 | AP clerk | upload a PO, receiving report, or invoice (PDF or photo) | nobody has to type it in |
| US-06 | AP clerk | have documents grouped by PO and matched automatically | they only look at what doesn't match |

## What "done" means (acceptance criteria)

### A. Uploading and asking for results

- [ ] **AC-1 Upload a document.** You can send a PDF, PNG, or JPEG (up to 10 MB).
  Reconcile saves it and starts processing it. If you upload the **exact same
  file twice**, it recognizes it and doesn't process it again.
- [ ] **AC-2 Ask for results.** There are web addresses to see:
  - all documents, and one document in detail: what the AI read, how sure it was,
    and anything that needs a human look
  - the original file
  - each PO: its documents and its status ("waiting for documents", "matched", or "needs review")
  - all problems found, filtered by type or status, each with its plain-English explanation
- [ ] **AC-3 Clear rules and a manual.** Every request and answer is checked
  against a fixed format, and errors come back in one standard format. A **live
  manual** at `/docs` lists every address and lets you try them in the browser.

### B. The background helper (worker)

- [ ] **AC-4 Reading.** The worker reads each document with the AI and saves what it
  read as a new version, without overwriting older ones. It marks the document
  **ready**, **needs review**, or **failed** (after a few retries). If it's asked
  to read the same file twice, it does the work once.
- [ ] **AC-5 Matching.** When a PO gets a new document, the worker matches that PO
  again and saves the result as a new version. If a human already made a
  decision on a problem, that decision **carries over** to the same problem in
  the new version.
- [ ] **AC-6 Patience with missing documents.** Documents often arrive days apart.
  Reconcile waits (7 days by default) before saying "this PO is missing its
  receiving report". Until then the PO shows as *waiting*.
- [ ] **AC-7 Respecting the AI's speed limits.** Even with several workers
  running, together they never go over the AI provider's free-tier limits. They
  share one counter.
- [ ] **AC-8 A record of everything.** Every automatic step (uploaded, read, flagged,
  matched, problem found) is written to the unchangeable history (the *audit log*).

### C. The AI joins the matching

- [ ] **AC-9 AI matching for tricky lines.** For lines the simple rules can't pair
  (no SKU, different wording), the AI can suggest pairs, and it **must explain
  why** each time. It uses the same cache, speed limits, and cost tracking as
  document reading.
- [ ] **AC-10 Only if it helps.** The scoreboard compares the AI matcher with
  today's text matcher on the same documents, including cost and speed. We use
  whichever actually scores better.

### D. Proving the whole thing works

- [ ] **AC-11 Full test.** An automatic test uploads a set of documents, lets the
  worker process them (using saved AI answers, so no key and no cost), and checks
  the problems Reconcile reports against the answer key.
- [ ] **AC-12 The scoreboard tells the truth.** Running the 20 test sets through
  the **real** upload-and-worker path gives the same results as the scoreboard.
  This proves the scoreboard measures the real system, not a shortcut.
- [ ] **AC-13 Instructions.** The README explains how to start everything with
  one command, upload a file, and open the manual.

## Not in M4

- The website, and human actions like approve, dispute, or write off (M5)
- Fixing fields the AI was unsure about (M5)
- The AI-assistant connector (MCP, M6). Logins (we keep one built-in user for now).

## Things we're assuming

- Uploaded files are kept in a `storage/` folder on your computer. It's easy to
  switch to cloud storage later.
- Matching happens one PO at a time. Duplicate invoices are still caught across
  POs, because the worker also looks at that vendor's other invoices.

## Questions for you

- **Q1. Fix misread PO numbers now (backlog B-17)?** If a document's PO number is
  one character off from a real PO of the same vendor, group them anyway and
  flag it for a human. This was the biggest error in M3's full-pipeline score.
  *I recommend: yes.* It's small and makes a big difference.
- **Q2. Harder test cases for the AI matcher?** The simple text matcher already gets
  100%, so the AI has no room to show it's useful. We'd add invoices that use the
  **vendor's own product names** ("Sunpeak Nut Spread, Crunchy Almond" instead of
  "Sunpeak Crunchy Almond Butter"). *I recommend: yes.* Otherwise the comparison
  tells us nothing.
- **Q3. Documents the AI was unsure about: match them now, or wait for a human?**
  Waiting is safest, but the review screen only arrives in M5. *I recommend:
  match them now and label the PO "provisional, needs review",* so nothing is
  hidden and nothing is treated as final.
- **Q4. Date checks (backlog B-18): now or later?** *I recommend: later (M5),* to keep
  M4 focused.
