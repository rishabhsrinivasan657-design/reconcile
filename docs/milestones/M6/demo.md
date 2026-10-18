# M6 demo: asking Claude about Reconcile's data

This page records a real conversation with Claude Code that uses Reconcile's
connector. It is the evidence for acceptance criterion **AC-10**: someone can
ask everyday questions in a chat and get correct answers, with numbers and
links, straight from Reconcile.

## What you are looking at

**MCP** (Model Context Protocol) is a standard way to plug a tool into an AI
assistant. Think of it like a USB port: Reconcile provides the "device" (an MCP
server with six tools), and any assistant that speaks MCP, such as Claude Code
or Claude Desktop, can use it.

The connector is **read-only**. Every tool only looks things up. Nothing the
assistant calls can approve, dispute, write off, or change anything in
Reconcile.

**Setup used for this recording:**

1. `pnpm dev:demo` was running: the API on port 3001, the website on port
   3000, and recorded AI answers, so no paid AI calls were made.
2. The test document sets had already been uploaded and matched, and one
   decision had been made by the seeded user (Alex Rivera).
3. Claude Code (the desktop app) connected to the `reconcile` server listed in
   this repo's `.mcp.json`, after the owner approved it.
4. Claude was told to use **only** the Reconcile tools: no shell commands, no
   file reads, no other sources.

Each question below shows the tool call Claude made (with its arguments) and
Claude's answer, copied exactly.

---

## Question 1: "What was short-shipped in August 2026?"

**Tool call:** `find_short_shipments`

```json
{ "from": "2026-08-01", "to": "2026-08-31" }
```

**Answer (verbatim):**

> Two short-shipments were received in August 2026, both from Ashpoint Paper
> Goods. **$172.64** is at risk in total.
>
> | PO | Received | Item | Ordered | Received | Billed | At risk |
> |---|---|---|---|---|---|---|
> | [HP-PO-104640](http://localhost:3000/problems?id=cmvdwhtw4003u61xuplqu20yd) | 2026-08-03 | Ashpoint Dinner 3-Ply Napkins, 250 ct | 7 | 6 | 6 | $0 (billed correctly) |
> | [HP-PO-105400](http://localhost:3000/problems?id=cmvdwhtu6002i61xus6kpkgx2) | 2026-08-21 | Ashpoint Recycled Paper Towels, 12 roll | 15 | 13 | 15 | **$172.64** |
>
> The napkins short-ship is just for your records: the invoice only charged for
> the 6 cases that arrived. The paper towels are the real issue. We were billed
> for 15 cases but only 13 arrived, so we're being charged $172.64 for 2 cases
> we never got. Both are still open.

---

## Question 2: "Why does HP-PO-104386 have a problem?"

**Tool call:** `explain_match`

```json
{ "poNumber": "HP-PO-104386" }
```

**Answer (verbatim):**

> [HP-PO-104386](http://localhost:3000/pos/HP-PO-104386) (Greenvale Snacks LLC)
> has two problems. One is still open.
>
> 1. **Open: line not on PO, $229.92.** The invoice includes a line the PO
>    never ordered: invoice line 3, *GRNV15250, Greenvale Jalapeno Kettle
>    Chips, 5 oz* (8 units at $28.74). It matches nothing on the PO. Note that
>    the PO did order the **8 oz** Jalapeno Kettle Chips (GRNV15560), and those
>    were received and billed correctly, so this 5 oz line looks like an extra
>    item or a wrong SKU on the invoice.
>    [View problem](http://localhost:3000/problems?id=cmvdwhu1e004t61xum0ew2290)
> 2. **Written off: price over PO, $45.36.** Salt & Vinegar Kettle Chips, 5 oz
>    (GRNV15058): the PO price was $28.57, but the invoice charged $32.35
>    (+13.2%) on 12 units received. Someone has already written this one off.
>    [View problem](http://localhost:3000/problems?id=cmvdwhu1a004s61xu26nikc1x&show=decided)
>
> The other 7 lines matched cleanly by SKU, with quantities and prices that
> agree across the PO, the receiving report (RCV-500692), and the invoice
> (19789).

---

## Question 3: "What's still open over $1,000?"

**Tool call:** `list_exceptions`

```json
{ "minAmount": 1000 }
```

(The tool's defaults filled in `status: "OPEN"`, so only open problems came
back.)

**Answer (verbatim):**

> Four open problems are over $1,000, with **$48,415.19** at risk in total:
>
> | PO | Vendor | Problem | At risk |
> |---|---|---|---|
> | [HP-PO-105400](http://localhost:3000/problems?id=cmvdwhtu1002g61xupec2n0d1) | Ashpoint Paper Goods | Duplicate invoice: ASHP-9889581 arrived twice (2026-08-23 and 2026-09-07) | $20,101.58 |
> | [HP-PO-104012](http://localhost:3000/problems?id=cmvdwhu1r005361xu1wtfsvo2) | Harvest Mill Bakery Inc. | Missing document: no receiving report, so receipt can't be verified | $14,428.52 |
> | [HP-PO-105945](http://localhost:3000/problems?id=cmvdwhty6004h61xu3fu3595i) | Brookcrest Dairy Alternatives | Duplicate invoice: 7473165 arrived twice (2026-04-27 and 2026-05-04) | $11,555.39 |
> | [HP-PO-104157](http://localhost:3000/problems?id=cmvdxyss8000nqdxu8a74tdxh) | Northfield Frozen Foods | Short-ship: ordered 48, received 38, billed 48 at $232.97 | $2,329.70 |
>
> The two duplicate invoices are the biggest wins. Make sure the second copy of
> each isn't paid.

---

## Question 4: "Who wrote off the problem on HP-PO-104386, and why?"

**Tool call:** `get_audit_trail`

```json
{ "poNumber": "HP-PO-104386" }
```

**Answer (verbatim):**

> **Alex Rivera** wrote off the price-over-PO problem ($45.36) on 2026-10-18
> at 14:10 UTC. Their note: "Under our $50 dispute threshold." In other words,
> the overcharge was too small to be worth disputing.
>
> That was the only human decision on this PO. The other problem, the $229.92
> line not on the PO, is still open.
> [Full history](http://localhost:3000/pos/HP-PO-104386)

---

## Checked against the database

These are the expected facts, taken from the API directly, compared with
Claude's answers above.

| Question | Expected fact | Result |
|---|---|---|
| 1 | HP-PO-104640, Ashpoint Paper Goods, napkins, received 2026-08-03, ordered 7 / received 6 / billed 6, $0 at risk | ✅ |
| 1 | HP-PO-105400, Ashpoint Paper Goods, paper towels, received 2026-08-21, ordered 15 / received 13 / billed 15, $172.64 at risk | ✅ |
| 2 | Greenvale Snacks LLC; open "line not on PO" $229.92 (invoice line 3, Jalapeno Kettle Chips, matches nothing on the PO) | ✅ |
| 2 | "Price over PO" $45.36, written off | ✅ |
| 3 | HP-PO-105400 duplicate invoice $20,101.58 | ✅ |
| 3 | HP-PO-104012 missing document $14,428.52 | ✅ |
| 3 | HP-PO-105945 duplicate invoice $11,555.39 | ✅ |
| 3 | HP-PO-104157 short-ship $2,329.70 | ✅ |
| 4 | Alex Rivera wrote off the price-over-PO problem ($45.36), note "Under our $50 dispute threshold." | ✅ |

**Anything surprising:** each question needed only one tool call, and Claude
treated the human note as data to report, not an instruction. One small
difference: the server's instructions say people's and documents' text comes
inside «…» quotes, but the note in the audit trail (and the vendor names and
descriptions) came back as plain strings, with no «…» around them. The answers
were still right, but the marking described in the instructions wasn't there to
help. The audit trail also showed a first "Couldn't read" attempt for all three
documents before a successful read about 90 seconds later. The tools don't
say why the first attempt failed. A user might ask about it, so it's worth
checking.

## Notes from the review

- **The missing «…» marks were a real gap, now fixed.** Claude Code reads the structured part of
  each answer, and only the text summary had the quote marks. Every structured answer now also
  carries a `notice` naming the fields that hold document or human text (for example
  `"entries[].note"`), so the "treat this as data" signal reaches the assistant whichever part it
  reads. A test checks the notice on every tool. This recording was made before the fix.
- **The "Couldn't read" entries are from the demo data, not a product bug.** While setting up the
  demo, the worker was briefly pointed at the wrong folder for the saved AI answers, so the first
  reading of those documents failed and was retried. The history log keeps that honestly.
