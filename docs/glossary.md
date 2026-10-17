# Glossary

Domain and project terms, in alphabetical order. Add a term the first time it
appears in a doc or the code.

| Term | Meaning |
|---|---|
| **3-way match** | Checking that the purchase order, receiving report, and invoice agree on items, quantities, and prices before paying. (A *2-way match* skips the receiving report.) |
| **Acceptance criteria** | Concrete, testable conditions a feature must meet to count as done. |
| **ADR** | Architecture Decision Record. A short doc capturing one significant technical decision: its context, the options, the choice, and the consequences. |
| **Answer key** | The `ground_truth.json` written with every generated set: correct field values and locations, line matches, and expected exceptions. |
| **AP (Accounts Payable)** | The finance team that pays suppliers. |
| **API** | A set of web addresses other programs (and the website) use to send files and get results. Ours lives in `apps/api`. |
| **Audit log / trail** | An append-only record of who did what and when. It can't be edited or deleted. |
| **Baseline (eval)** | The committed metric values that new changes are compared against. A drop of more than 2 points fails CI. |
| **Baseline gate** | The CI check that fails a pull request if any eval score drops more than 2 points below `evals/baseline.json`. |
| **bbox** | Bounding box: the rectangle on a page where a field was found. |
| **CPG** | Consumer Packaged Goods: food, beverage, household products sold through retailers. |
| **Debounce** | Waiting a moment so a burst of identical requests becomes one. Three uploads for one PO trigger one match, not three. |
| **Deduction** | An amount a retailer subtracts from a payment to the brand (for shortages, damages, promotions, compliance fines). Planned for later, see backlog. |
| **Dispute** | An exception action meaning "the supplier is wrong; contest it." |
| **Distributor** | A wholesaler that buys from suppliers and resells to retailers. |
| **Document set** | The PO, RR, and invoice(s) that share a PO number. |
| **Eval / golden set** | A labeled dataset and harness used to measure system quality objectively. |
| **Exception** | A detected discrepancy that needs a human decision. |
| **Extraction** | Turning a document image or PDF into structured, typed fields. |
| **F1** | The harmonic mean of precision and recall. It balances the two. |
| **Fingerprint (file / problem)** | A short code that's the same only for identical things. For files it's a hash of the bytes; for problems it's the type + PO + exact lines, so a decision can follow the problem into a new match version. |
| **Fuzzy match** | Matching lines whose descriptions differ in wording ("Org. Almond Btr 12oz" vs "Organic Almond Butter, 12 oz"). Done by the LLM only after the deterministic rules. |
| **Grace period** | How long Reconcile waits (7 days by default) before reporting a missing document, since documents often arrive days apart. |
| **Ground truth** | The known-correct answers. The synthetic generator writes these alongside each set. |
| **Hybrid pairing** | The word-similarity matcher pairs what it's sure about; the AI only sees the lines left over. |
| **Idempotent** | Safe to do twice: running the same job again gives the same result and no duplicates. |
| **Invoice (INV)** | The supplier's bill: what they charge you for. |
| **Line item** | One row on a document: SKU, description, qty, unit price, line total. |
| **Line key** | A stable name for one line on one document, `<role>:<line number>` (e.g. `po:3`, `inv-1:5`). |
| **Link (eval)** | A pair of lines that belong together across two documents (PO–RR, PO–invoice, RR–invoice). Link precision/recall compare these pairs with the answer key. |
| **MCP** | Model Context Protocol. An open standard that lets AI assistants call tools and read data from apps. |
| **Near miss / price noise** | A planted price difference small enough to be inside tolerance. It must *not* raise an exception, which tests false alarms. |
| **Over-ship** | More units received than ordered. |
| **Planted error** | A mistake the generator puts into a document set on purpose (e.g. a short-ship), so we know the right answer. |
| **Precision** | Of the things flagged, the fraction that were actually right. |
| **Price variance** | The invoice unit price differs from the agreed PO price. |
| **Prompt version** | An identifier bumped whenever an LLM prompt changes. It's part of the cache key, so results stay comparable. |
| **Provisional** | Matched, but labeled "needs review" because a document was unsure or an assumption was made (like a misread PO number). |
| **Purchase order (PO)** | The buyer's order to a supplier: what was agreed, at what price. |
| **Queue** | A to-do list between the API and the worker. Jobs wait there safely until the worker is ready. We use BullMQ on Redis. |
| **Recall** | Of the things that should have been flagged, the fraction that actually were. |
| **Receiving report (RR)** | The warehouse's record of what physically arrived. |
| **Replay mode** | Running evals from cached LLM responses, with no live API calls. |
| **SDLC** | Software Development Life Cycle: Requirements → Design → Implementation → Testing → Review/Release → Maintenance. |
| **Short-ship** | Fewer units received than ordered. |
| **SKU** | Stock Keeping Unit: a supplier's or company's product code. |
| **Tolerance** | The allowed difference before something counts as a mismatch (e.g. price within 1% or $0.01). |
| **UOM** | Unit of measure (each, case, pallet). |
| **Worker** | The background helper program that does the slow work (AI reading, matching) so uploads answer instantly. |
| **Write-off** | An exception action meaning "accept the difference as a loss; don't pursue it." |
