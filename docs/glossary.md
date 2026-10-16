# Glossary

Domain and project terms, in alphabetical order. Add a term the first time it
appears in a doc or the code.

| Term | Meaning |
|---|---|
| **3-way match** | Checking that the purchase order, receiving report, and invoice agree on items, quantities, and prices before paying. (A *2-way match* skips the receiving report.) |
| **ADR** | Architecture Decision Record. A short doc capturing one significant technical decision: its context, the options, the choice, and the consequences. |
| **Acceptance criteria** | Concrete, testable conditions a feature must meet to count as done. |
| **AP (Accounts Payable)** | The finance team that pays suppliers. |
| **Audit log / trail** | An append-only record of who did what and when. It can't be edited or deleted. |
| **Baseline (eval)** | The committed metric values that new changes are compared against. A drop of more than 2 points fails CI. |
| **bbox** | Bounding box: the rectangle on a page where a field was found. |
| **CPG** | Consumer Packaged Goods: food, beverage, household products sold through retailers. |
| **Deduction** | An amount a retailer subtracts from a payment to the brand (for shortages, damages, promotions, compliance fines). Planned for later, see backlog. |
| **Dispute** | An exception action meaning "the supplier is wrong; contest it." |
| **Distributor** | A wholesaler that buys from suppliers and resells to retailers. |
| **Document set** | The PO, RR, and invoice(s) that share a PO number. |
| **Eval / golden set** | A labeled dataset and harness used to measure system quality objectively. |
| **Exception** | A detected discrepancy that needs a human decision. |
| **Extraction** | Turning a document image or PDF into structured, typed fields. |
| **F1** | The harmonic mean of precision and recall. It balances the two. |
| **Fuzzy match** | Matching lines whose descriptions differ in wording ("Org. Almond Btr 12oz" vs "Organic Almond Butter, 12 oz"). Done by the LLM only after the deterministic rules. |
| **Answer key** | The `ground_truth.json` written with every generated set: correct field values and locations, line matches, and expected exceptions. |
| **Ground truth** | The known-correct answers. The synthetic generator writes these alongside each set. |
| **Invoice (INV)** | The supplier's bill: what they charge you for. |
| **Line key** | A stable name for one line on one document, `<role>:<line number>` (e.g. `po:3`, `inv-1:5`). |
| **Line item** | One row on a document: SKU, description, qty, unit price, line total. |
| **MCP** | Model Context Protocol. An open standard that lets AI assistants call tools and read data from apps. |
| **Over-ship** | More units received than ordered. |
| **Planted error** | A mistake the generator puts into a document set on purpose (e.g. a short-ship), so we know the right answer. |
| **Precision** | Of the things flagged, the fraction that were actually right. |
| **Price variance** | The invoice unit price differs from the agreed PO price. |
| **Prompt version** | An identifier bumped whenever an LLM prompt changes. It's part of the cache key, so results stay comparable. |
| **Purchase order (PO)** | The buyer's order to a supplier: what was agreed, at what price. |
| **Receiving report (RR)** | The warehouse's record of what physically arrived. |
| **Recall** | Of the things that should have been flagged, the fraction that actually were. |
| **Replay mode** | Running evals from cached LLM responses, with no live API calls. |
| **SDLC** | Software Development Life Cycle: Requirements → Design → Implementation → Testing → Review/Release → Maintenance. |
| **Short-ship** | Fewer units received than ordered. |
| **SKU** | Stock Keeping Unit: a supplier's or company's product code. |
| **Tolerance** | The allowed difference before something counts as a mismatch (e.g. price within 1% or $0.01). |
| **UOM** | Unit of measure (each, case, pallet). |
| **Write-off** | An exception action meaning "accept the difference as a loss; don't pursue it." |
